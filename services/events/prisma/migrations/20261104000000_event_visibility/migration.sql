CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'UNLISTED', 'INVITE_ONLY');
ALTER TABLE "event" ADD COLUMN "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC';
CREATE INDEX "event_visibility_status_createdAt_id_idx" ON "event"("visibility", "status", "createdAt", "id");
