ALTER TABLE "event" ADD COLUMN "lastSnapshotEventId" UUID;

UPDATE "event" AS event
SET "lastSnapshotEventId" = snapshot."id"
FROM (
  SELECT DISTINCT ON ("aggregateId") "aggregateId", "id"
  FROM "outbox_event"
  WHERE "eventType" IN ('event.created', 'event.updated', 'event.cancelled')
  ORDER BY "aggregateId", "position" DESC
) AS snapshot
WHERE event."id" = snapshot."aggregateId";
