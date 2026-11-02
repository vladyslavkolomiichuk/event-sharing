CREATE TABLE "pending_membership_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "envelope" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "pending_membership_event_eventId_idx"
ON "pending_membership_event"("eventId");

CREATE INDEX "pending_membership_event_userId_idx"
ON "pending_membership_event"("userId");
