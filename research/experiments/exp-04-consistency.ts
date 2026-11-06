// EXP-04: capacity invariants under concurrent joins and convergence of projections.
import { seedEvents, seedStaff, seedUsers, type User } from '../lib/api.js';
import { waitForQuietPipeline } from '../lib/delivery.js';
import { runLoad, type LoadRequest } from '../lib/load.js';
import { round, saveTable, seededRandom } from '../lib/report.js';
import { count, isFinal, resetStack, sql, waitUntil } from '../lib/stack.js';

const ATTEMPTS = isFinal ? [100, 1_000, 5_000] : [100, 200];
const VUS = [10, 50, 100];
const CAPACITY = 50;
const SAME_USER_REQUESTS = 100;
const RANDOM_OPERATIONS = isFinal ? 1_000 : 300;
const CONVERGENCE_TIMEOUT_MS = 300_000;

// Expected zero rows: over capacity, or occupied differs from the JOINED count.
const INVARIANT_VIOLATIONS = `
  SELECT p."eventId"
  FROM registration_policy p
  LEFT JOIN membership m ON m."eventId" = p."eventId" AND m.status = 'JOINED'
  GROUP BY p."eventId"
  HAVING p.occupied > p.capacity OR p.occupied <> count(m."userId")`;

const joins = (users: User[], eventId: string): LoadRequest[] =>
  users.map(({ cookie }) => ({ method: 'POST', eventId, cookie }));

const joinedCount = (eventId: string) =>
  count(
    'participation_db',
    `SELECT count(*) FROM membership WHERE "eventId" = '${eventId}' AND status = 'JOINED'`,
  );

const members = (
  database: string,
  table: string,
  active: string,
  ids: string,
) =>
  new Set(
    sql(
      database,
      `SELECT "eventId", "userId" FROM ${table} WHERE ${active} AND "eventId" IN (${ids})`,
    ).map((row) => row.join('/')),
  );

function projectionDifferences(eventIds: string[]): number {
  const ids = eventIds.map((id) => `'${id}'`).join(',');
  const source = members(
    'participation_db',
    'membership',
    `status = 'JOINED'`,
    ids,
  );
  const projections = [
    members('events_db', 'participant_access', 'active', ids),
    members('notifications_db', 'membership_projection', 'active', ids),
    members('messages_db', 'membership_projection', 'active', ids),
  ];
  return projections.reduce(
    (total, projection) =>
      total +
      [...source].filter((key) => !projection.has(key)).length +
      [...projection].filter((key) => !source.has(key)).length,
    0,
  );
}

export async function run(): Promise<void> {
  resetStack();
  const staff = await seedStaff();
  const users = await seedUsers(Math.max(...ATTEMPTS));

  const capacityRows = [];
  for (const attempts of ATTEMPTS) {
    for (const vus of VUS) {
      const [eventId = ''] = await seedEvents(staff, 1, CAPACITY);
      const load = await runLoad(joins(users.slice(0, attempts), eventId), {
        vus,
      });
      const confirmed = joinedCount(eventId);
      capacityRows.push({
        attempts,
        capacity: CAPACITY,
        vus,
        httpP50: round(load.httpP50),
        httpP95: round(load.httpP95),
        accepted: load.accepted,
        rejected: load.rejected,
        failed: load.failed,
        failedStatuses: load.failedStatuses,
        confirmed,
        overCapacity: Math.max(0, confirmed - CAPACITY),
        violations: sql('participation_db', INVARIANT_VIOLATIONS).length,
      });
    }
  }
  saveTable('exp-04', 'capacity', capacityRows);

  // One user repeats the same join in parallel, which must leave a single membership.
  const [sameUser] = users;
  if (!sameUser) throw new Error('No users were seeded.');
  const [sameUserEvent = ''] = await seedEvents(staff, 1, CAPACITY);
  const repeated = await runLoad(
    Array.from(
      { length: SAME_USER_REQUESTS },
      () => joins([sameUser], sameUserEvent)[0]!,
    ),
    { vus: SAME_USER_REQUESTS },
  );
  saveTable('exp-04', 'same-user', [
    {
      requests: SAME_USER_REQUESTS,
      accepted: repeated.accepted,
      rejected: repeated.rejected,
      failed: repeated.failed,
      memberships: joinedCount(sameUserEvent),
    },
  ]);

  // Random joins and leaves, then every projection must match Participation.
  await waitForQuietPipeline();
  const eventIds = await seedEvents(staff, 3, users.length);
  const random = seededRandom(11);
  const pick = <Item>(items: Item[]) =>
    items[Math.floor(random() * items.length)]!;
  const operations = Array.from(
    { length: RANDOM_OPERATIONS },
    (): LoadRequest => ({
      method: random() < 0.7 ? 'POST' : 'DELETE',
      eventId: pick(eventIds),
      cookie: pick(users).cookie,
    }),
  );
  const load = await runLoad(operations, { vus: 20 });
  const initialDifferences = projectionDifferences(eventIds);
  const startedAt = Date.now();
  const converged = await waitUntil(
    () => projectionDifferences(eventIds) === 0,
    CONVERGENCE_TIMEOUT_MS,
    250,
  );
  saveTable('exp-04', 'convergence', [
    {
      operations: RANDOM_OPERATIONS,
      accepted: load.accepted,
      rejected: load.rejected,
      failed: load.failed,
      differencesAfterLoad: initialDifferences,
      converged,
      convergenceSeconds: round((Date.now() - startedAt) / 1000, 2),
      remainingDifferences: projectionDifferences(eventIds),
      violations: sql('participation_db', INVARIANT_VIOLATIONS).length,
    },
  ]);
}
