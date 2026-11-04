ALTER TABLE "membership_projection" ADD COLUMN "lastMembershipEventId" UUID;
ALTER TABLE "pending_membership_event" ADD COLUMN "previousEventId" UUID;
CREATE INDEX "pending_membership_event_previousEventId_idx" ON "pending_membership_event" ("previousEventId");
