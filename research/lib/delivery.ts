import { stats } from './report.js';
import { count, sql, waitUntil } from './stack.js';

const millis = (column: string) =>
  `(extract(epoch FROM ${column}) * 1000)::bigint`;

export const joinedNotifications = () =>
  count(
    'notifications_db',
    `SELECT count(*) FROM in_app_notification WHERE type = 'PARTICIPANT_JOINED'`,
  );

const quotedIds = (ids: string[]) => ids.map((id) => `'${id}'`).join(',');

// Counts commits, because a timed-out request may still have joined the event.
export const committedJoins = (eventIds: string[]) =>
  count(
    'participation_db',
    `SELECT count(*) FROM outbox_event
     WHERE "eventType" = 'user.joined' AND "aggregateId" IN (${quotedIds(eventIds)})`,
  );

export const pendingOutbox = () =>
  count(
    'participation_db',
    'SELECT count(*) FROM outbox_event WHERE "publishedAt" IS NULL',
  );

// Baselines must not include events that are still travelling through Kafka.
export async function waitForQuietPipeline(timeoutMs = 120_000): Promise<void> {
  let previous = -1;
  const quiet = await waitUntil(
    () => {
      const current = joinedNotifications();
      const settled = pendingOutbox() === 0 && current === previous;
      previous = current;
      return settled;
    },
    timeoutMs,
    2_000,
  );
  if (!quiet) throw new Error('The pipeline did not become quiet.');
}

// Every timestamp comes from one PostgreSQL clock, so stages are comparable.
export function deliveryStages(eventIds: string[]) {
  const ids = quotedIds(eventIds);
  const outbox = sql(
    'participation_db',
    `SELECT id, ${millis('"occurredAt"')}, ${millis('"publishedAt"')}
     FROM outbox_event
     WHERE "eventType" = 'user.joined' AND "aggregateId" IN (${ids})`,
  );
  const inbox = new Map(
    sql(
      'notifications_db',
      `SELECT id, ${millis('"processedAt"')} FROM inbox_event WHERE "eventType" = 'user.joined'`,
    ).map(([id, at]) => [id, Number(at)]),
  );
  const notifications = sql(
    'notifications_db',
    `SELECT "sourceEventId", ${millis('"createdAt"')} FROM in_app_notification
     WHERE type = 'PARTICIPANT_JOINED'`,
  );
  const stored = new Map(notifications.map(([id, at]) => [id, Number(at)]));

  const delivered = outbox.flatMap(([id, occurred, published]) => {
    const processedAt = inbox.get(id);
    const storedAt = stored.get(id);
    return processedAt === undefined || storedAt === undefined
      ? []
      : [
          {
            occurred: Number(occurred),
            published: Number(published),
            processedAt,
            storedAt,
          },
        ];
  });

  const sourceIds = new Set(outbox.map(([id]) => id));
  const matched = notifications.filter(([id]) => sourceIds.has(id));
  return {
    expected: outbox.length,
    delivered: delivered.length,
    lost: outbox.length - new Set(matched.map(([id]) => id)).size,
    duplicates: matched.length - new Set(matched.map(([id]) => id)).size,
    toPublish: stats(delivered.map((row) => row.published - row.occurred)),
    toConsume: stats(delivered.map((row) => row.processedAt - row.published)),
    toStore: stats(delivered.map((row) => row.storedAt - row.processedAt)),
    endToEnd: stats(delivered.map((row) => row.storedAt - row.occurred)),
    drainSeconds:
      delivered.length === 0
        ? 0
        : (Math.max(...delivered.map((row) => row.storedAt)) -
            Math.min(...delivered.map((row) => row.occurred))) /
          1000,
  };
}
