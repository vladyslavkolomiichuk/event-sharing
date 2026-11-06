// EXP-01: response time and end-to-end delivery of a join through Kafka and Outbox.
import { seedEvents, seedStaff, seedUsers } from '../lib/api.js';
import {
  deliveryStages,
  joinedNotifications,
  waitForQuietPipeline,
} from '../lib/delivery.js';
import { joinPairs, runLoad } from '../lib/load.js';
import { round, saveTable } from '../lib/report.js';
import { isFinal, mode, resetStack, waitUntil } from '../lib/stack.js';

const SIZES = isFinal ? [1_000, 10_000, 50_000] : [200, 1_000];
const REPEATS = isFinal ? 3 : 1;
const USERS = isFinal ? 250 : 50;
const EVENTS = isFinal ? 200 : 40;
const VUS = 20;
// Below measured capacity, so this series shows delay without a growing queue.
const CONTROL_RATE = 20;
const CONTROL_SIZE = isFinal ? 1_200 : 600;
const WARM_UP = 50;

// HTTP delivery skips these stages, and Kafka still publishes the event afterwards.
const kafkaStage = (value: number) => (mode === 'kafka' ? value : 'n/a');

async function measure(
  series: string,
  size: number,
  repeat: number,
  rate?: number,
) {
  resetStack();
  const staff = await seedStaff();
  const users = await seedUsers(USERS);
  const [warmUpEvent = ''] = await seedEvents(staff, 1, USERS);
  const eventIds = await seedEvents(staff, EVENTS, USERS);
  await runLoad(joinPairs(users, [warmUpEvent], WARM_UP), { vus: 5 });
  await waitForQuietPipeline();

  const baseline = joinedNotifications();
  const load = await runLoad(joinPairs(users, eventIds, size), {
    vus: VUS,
    ...(rate ? { rate } : {}),
  });
  const complete = await waitUntil(
    () => joinedNotifications() >= baseline + load.accepted,
    // HTTP has no recovery path, so missing notifications stay missing.
    mode === 'http' ? 60_000 : 1_800_000,
    2_000,
  );
  const stages = deliveryStages(eventIds);
  console.info(`${series} N=${size} repeat=${repeat}: complete=${complete}`);
  return {
    mode,
    series,
    N: size,
    repeat,
    httpP50: round(load.httpP50),
    httpP95: round(load.httpP95),
    httpP99: round(load.httpP99),
    endToEndP50: stages.endToEnd.p50,
    endToEndP95: stages.endToEnd.p95,
    toPublishP50: kafkaStage(stages.toPublish.p50),
    toConsumeP50: kafkaStage(stages.toConsume.p50),
    toStoreP50: kafkaStage(stages.toStore.p50),
    accepted: load.accepted,
    failed: load.failed,
    dropped: load.dropped,
    requestsPerSecond: round(load.requestsPerSecond),
    notifications: stages.delivered,
    lost: stages.lost,
    drainSeconds: round(stages.drainSeconds),
    cpuPercent: round(load.cpuPercent),
    memoryMiB: round(load.memoryMiB, 0),
  };
}

export async function run(): Promise<void> {
  const rows = [];
  for (const size of SIZES)
    for (let repeat = 1; repeat <= REPEATS; repeat += 1)
      rows.push(await measure('saturated', size, repeat));
  for (let repeat = 1; repeat <= REPEATS; repeat += 1)
    rows.push(await measure('control', CONTROL_SIZE, repeat, CONTROL_RATE));
  saveTable('exp-01', `delivery-${mode}`, rows);
}
