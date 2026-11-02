ALTER TABLE "outbox_event" ADD COLUMN "position" BIGSERIAL;

WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "occurredAt", "id") AS "number"
  FROM "outbox_event"
)
UPDATE "outbox_event" AS event
SET "position" = ordered."number"
FROM ordered
WHERE event."id" = ordered."id";

SELECT setval(
  pg_get_serial_sequence('outbox_event', 'position'),
  COALESCE(MAX("position"), 1),
  COUNT(*) > 0
)
FROM "outbox_event";

CREATE UNIQUE INDEX "outbox_event_position_key" ON "outbox_event"("position");
