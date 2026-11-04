ALTER TABLE "participant_access" ADD COLUMN "lastMembershipEventId" UUID;
CREATE TABLE "pending_membership_event" (
  "id" UUID PRIMARY KEY,
  "previousEventId" UUID,
  "envelope" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pending_membership_event_previousEventId_idx" ON "pending_membership_event" ("previousEventId");
