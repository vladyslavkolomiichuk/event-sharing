// EXP-02: delivery when Notifications or the broker fails, and repeated delivery.
import {
  call,
  seedEvents,
  seedStaff,
  seedUsers,
  type User,
} from '../lib/api.js';
import {
  committedJoins,
  deliveryStages,
  joinedNotifications,
  pendingOutbox,
  waitForQuietPipeline,
} from '../lib/delivery.js';
import { joinPairs, runLoad } from '../lib/load.js';
import { round, saveTable } from '../lib/report.js';
import {
  consumerGroups,
  count,
  isFinal,
  killService,
  mode,
  resetStack,
  sleep,
  startService,
  waitUntil,
} from '../lib/stack.js';

const CONSUMER_OUTAGE_SIZES = isFinal ? [100, 1_000, 5_000] : [100, 500];
const BROKER_LOAD = isFinal ? 1_000 : 500;
const LOAD_BEFORE_BROKER_FAILURE_MS = 5_000;
const OUTAGE_MS = isFinal ? 60_000 : 30_000;
const USERS = isFinal ? 250 : 50;
const EVENTS_PER_RUN = isFinal ? 40 : 10;
const CONSUMER_GROUP = 'event-sharing-notifications-domain-v1';
const DELIVERY_TIMEOUT_MS = 900_000;

type Context = {
  users: User[];
  nextEvents: () => Promise<string[]>;
};

const seconds = (startedAt: number) => round((Date.now() - startedAt) / 1000);

// Every scenario fills the same columns, so one table holds them all.
const failureRow = (
  scenario: string,
  fields: Partial<Record<string, string | number>>,
) => ({
  scenario,
  N: 0,
  accepted: 0,
  failed: 0,
  failedStatuses: '-',
  committed: 0,
  delivered: 0,
  lost: 0,
  duplicates: 0,
  pendingAtFailure: 0,
  probeStatuses: '-',
  apiRecoverySeconds: 0,
  replayedMessages: 0,
  newInboxRows: 0,
  fullDeliverySeconds: 0,
  ...fields,
});

const waitForDelivery = (baseline: number, eventIds: string[]) =>
  waitUntil(
    () => joinedNotifications() >= baseline + committedJoins(eventIds),
    // HTTP has no recovery path, so missing notifications stay missing.
    mode === 'http' ? 30_000 : DELIVERY_TIMEOUT_MS,
  );

async function consumerOutage({ users, nextEvents }: Context, size: number) {
  const eventIds = await nextEvents();
  const baseline = joinedNotifications();
  killService('notifications');
  const load = await runLoad(joinPairs(users, eventIds, size), { vus: 20 });
  await sleep(OUTAGE_MS);

  const restartedAt = Date.now();
  startService('notifications');
  await waitForDelivery(baseline, eventIds);
  const fullDeliverySeconds = seconds(restartedAt);
  const stages = deliveryStages(eventIds);
  return failureRow('notifications down', {
    N: size,
    accepted: load.accepted,
    failed: load.failed,
    failedStatuses: load.failedStatuses,
    committed: stages.expected,
    delivered: stages.delivered,
    lost: stages.lost,
    duplicates: stages.duplicates,
    fullDeliverySeconds,
  });
}

// The broker dies during the load, so committed events are still in the outbox.
async function brokerOutage({ users, nextEvents }: Context) {
  const [probeUser] = users;
  if (!probeUser) throw new Error('No users were seeded.');
  const eventIds = await nextEvents();
  const baseline = joinedNotifications();
  const loading = runLoad(joinPairs(users, eventIds, BROKER_LOAD), { vus: 20 });
  await sleep(LOAD_BEFORE_BROKER_FAILURE_MS);
  killService('kafka');
  const pendingAtFailure = pendingOutbox();

  const statuses = new Map<number, number>();
  const outageEndsAt = Date.now() + OUTAGE_MS;
  while (Date.now() < outageEndsAt) {
    const { status } = await call(probeUser, 'GET', '/api/notifications').catch(
      () => ({ status: 0 }),
    );
    statuses.set(status, (statuses.get(status) ?? 0) + 1);
    await sleep(1_000);
  }

  const restartedAt = Date.now();
  startService('kafka');
  await waitUntil(async () => {
    const { status } = await call(probeUser, 'GET', '/api/notifications');
    return status === 200;
  }, DELIVERY_TIMEOUT_MS);
  const apiRecoverySeconds = seconds(restartedAt);
  const load = await loading;
  await waitForDelivery(baseline, eventIds);
  const fullDeliverySeconds = seconds(restartedAt);
  const stages = deliveryStages(eventIds);
  return failureRow('broker down', {
    N: BROKER_LOAD,
    accepted: load.accepted,
    failed: load.failed,
    failedStatuses: load.failedStatuses,
    committed: stages.expected,
    delivered: stages.delivered,
    lost: stages.lost,
    duplicates: stages.duplicates,
    pendingAtFailure,
    probeStatuses: [...statuses]
      .map(([status, total]) => `${status}:${total}`)
      .join(' '),
    apiRecoverySeconds,
    fullDeliverySeconds,
  });
}

function consumerLag(): number[] {
  return consumerGroups(CONSUMER_GROUP, ['--describe'])
    .split('\n')
    .flatMap((line) => line.match(/ (\d+) +\S+ +\S+ +\S+$/)?.[1] ?? [])
    .map(Number);
}

// The tool exits successfully even when it refuses, so only the lag proves a reset.
// It refuses until Kafka notices that the killed consumer has gone.
async function repeatedDelivery() {
  await waitForQuietPipeline();
  const before = joinedNotifications();
  const inboxQuery = 'SELECT count(*) FROM inbox_event';
  const inboxBefore = count('notifications_db', inboxQuery);
  killService('notifications');
  let replayedMessages = 0;
  const reset = await waitUntil(
    () => {
      consumerGroups(CONSUMER_GROUP, [
        '--reset-offsets',
        '--to-earliest',
        '--all-topics',
        '--execute',
      ]);
      replayedMessages = consumerLag().reduce((sum, lag) => sum + lag, 0);
      return replayedMessages > 0;
    },
    180_000,
    5_000,
  );
  if (!reset) throw new Error('Consumer offsets were not reset.');

  const restartedAt = Date.now();
  startService('notifications');
  const drained = await waitUntil(
    () => {
      const lags = consumerLag();
      return lags.length > 0 && lags.every((lag) => lag === 0);
    },
    DELIVERY_TIMEOUT_MS,
    2_000,
  );
  if (!drained) throw new Error('Repeated messages were not consumed.');
  const fullDeliverySeconds = seconds(restartedAt);
  return failureRow('repeated delivery', {
    N: before,
    duplicates: joinedNotifications() - before,
    replayedMessages,
    newInboxRows: count('notifications_db', inboxQuery) - inboxBefore,
    fullDeliverySeconds,
  });
}

export async function run(): Promise<void> {
  resetStack();
  const staff = await seedStaff();
  const users = await seedUsers(USERS);
  const context: Context = {
    users,
    nextEvents: () => seedEvents(staff, EVENTS_PER_RUN, USERS),
  };

  // Saving after each scenario keeps finished results if a later one fails.
  const rows: ReturnType<typeof failureRow>[] = [];
  const add = (row: ReturnType<typeof failureRow>) => {
    rows.push(row);
    saveTable('exp-02', `failures-${mode}`, rows);
  };
  for (const size of CONSUMER_OUTAGE_SIZES) {
    await waitForQuietPipeline();
    add(await consumerOutage(context, size));
  }
  // Broker failure and repeated delivery apply only to the Kafka configuration.
  if (mode === 'http') return;
  await waitForQuietPipeline();
  add(await brokerOutage(context));
  add(await repeatedDelivery());
}
