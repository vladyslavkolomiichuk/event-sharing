ALTER TABLE "chat_room" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';

UPDATE "chat_room" AS room
SET "status" = CASE
  WHEN room."archivedAt" IS NOT NULL THEN 'ARCHIVED'
  WHEN event."status" IN ('COMPLETED', 'CANCELLED', 'ARCHIVED') THEN 'READ_ONLY'
  ELSE 'ACTIVE'
END
FROM "event_projection" AS event
WHERE room."eventId" = event."id";

UPDATE "chat_room" SET "status" = 'ARCHIVED' WHERE "archivedAt" IS NOT NULL;

ALTER TABLE "chat_room"
ADD CONSTRAINT "chat_room_status_check"
CHECK ("status" IN ('ACTIVE', 'READ_ONLY', 'ARCHIVED'));
