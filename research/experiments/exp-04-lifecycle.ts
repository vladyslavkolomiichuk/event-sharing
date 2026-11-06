// EXP-04: rules that depend on time and event status, checked through the API.
import { randomUUID } from 'node:crypto';
import {
  call,
  createOpenEvent,
  seedStaff,
  seedUsers,
  type User,
} from '../lib/api.js';
import { saveTable } from '../lib/report.js';
import { count, resetStack, sleep, waitUntil } from '../lib/stack.js';

const FORBIDDEN_AFTER_COMPLETION = [
  'submit',
  'approve',
  'reject',
  'publish',
  'registration/open',
  'registration/close',
  'start',
  'complete',
  'cancel',
];

// These actions validate a required reason before they check the event status.
const BODIES: Record<string, object> = {
  reject: { reason: 'Research check' },
  cancel: { reason: 'Research check' },
};

type Check = {
  invariant: string;
  check: string;
  expected: string;
  actual: string;
  passed: boolean;
};

const checks: Check[] = [];

function record(
  invariant: string,
  check: string,
  expected: string,
  actual: string,
) {
  checks.push({
    invariant,
    check,
    expected,
    actual,
    passed: expected === actual,
  });
}

const outcome = ({ status, json }: { status: number; json: any }) =>
  `${status} ${json?.code ?? ''}`.trim();

const completedNotices = (recipient: User) =>
  count(
    'notifications_db',
    `SELECT count(*) FROM in_app_notification
     WHERE type = 'EVENT_COMPLETED' AND "recipientId" = '${recipient.id}'`,
  );

export async function run(): Promise<void> {
  await resetStack();
  const staff = await seedStaff();
  const { admin, organizer } = staff;
  const [member, lateUser] = await seedUsers(2);
  if (!member || !lateUser) throw new Error('Users were not seeded.');

  // A short event, because the lifecycle worker runs on the real clock.
  const eventId = await createOpenEvent(staff, 5, {
    chatEnabled: true,
    startTime: new Date(Date.now() + 45_000).toISOString(),
    endTime: new Date(Date.now() + 80_000).toISOString(),
  });
  const eventPath = `/api/events/${eventId}`;
  const joinPath = `/api/participation/events/${eventId}/join`;
  const roomsPath = `/api/messages/events/${eventId}/rooms`;

  record(
    'I8',
    'start before startTime',
    '409 EVENT_TIME_INVALID',
    outcome(await call(organizer, 'POST', `${eventPath}/start`, {})),
  );
  record(
    'I1',
    'join before endTime',
    '200',
    outcome(await call(member, 'POST', joinPath, {})),
  );

  let roomId = '';
  await waitUntil(async () => {
    const rooms = await call(member, 'GET', roomsPath);
    const items = rooms.json?.items ?? rooms.json;
    roomId = items?.[0]?.id ?? '';
    return roomId !== '';
  }, 30_000);
  const messages = `${roomsPath}/${roomId}/messages`;
  const message = (body: string) => ({ body, clientMessageId: randomUUID() });
  record(
    'I7',
    'send before completion',
    '201',
    outcome(await call(member, 'POST', messages, message('Before'))),
  );

  const completed = await waitUntil(
    async () => {
      const event = await call(organizer, 'GET', eventPath);
      return event.json?.status === 'COMPLETED' && !event.json?.pendingStatus;
    },
    180_000,
    1_000,
  );
  record('I1', 'event completes by itself', 'true', String(completed));

  record(
    'I1',
    'join after endTime',
    '409 REGISTRATION_CLOSED',
    outcome(await call(lateUser, 'POST', joinPath, {})),
  );

  await waitUntil(() => completedNotices(member) > 0, 60_000);
  record('I6', 'completion notices', '1', String(completedNotices(member)));

  // Room state follows the event through Kafka, so the wait is part of the check.
  let afterCompletion = '';
  await waitUntil(async () => {
    afterCompletion = outcome(
      await call(member, 'POST', messages, message('After')),
    );
    return afterCompletion.startsWith('4');
  }, 30_000);
  record(
    'I7',
    'send after completion rejected',
    'true',
    String(afterCompletion.startsWith('4')),
  );
  const history = await call(member, 'GET', messages);
  const bodies: string[] = (history.json?.items ?? []).map(
    (item: { body: string }) => item.body,
  );
  record(
    'I7',
    'history stays readable',
    'true',
    String(bodies.includes('Before')),
  );

  const before = await call(organizer, 'GET', eventPath);
  for (const action of FORBIDDEN_AFTER_COMPLETION) {
    const actor =
      action === 'approve' || action === 'reject' ? admin : organizer;
    record(
      'I8',
      `${action} from COMPLETED`,
      '409 INVALID_EVENT_TRANSITION',
      outcome(
        await call(
          actor,
          'POST',
          `${eventPath}/${action}`,
          BODIES[action] ?? {},
        ),
      ),
    );
  }
  await sleep(2_000);
  const after = await call(organizer, 'GET', eventPath);
  record('I8', 'status unchanged', before.json.status, after.json.status);
  record(
    'I8',
    'version unchanged',
    String(before.json.version),
    String(after.json.version),
  );
  record(
    'I6',
    'notices after repeated complete',
    '1',
    String(completedNotices(member)),
  );

  saveTable('exp-04', 'lifecycle', checks);
  const failures = checks.filter((check) => !check.passed);
  console.info(
    `Lifecycle checks: ${checks.length - failures.length} of ${checks.length} passed.`,
  );
}
