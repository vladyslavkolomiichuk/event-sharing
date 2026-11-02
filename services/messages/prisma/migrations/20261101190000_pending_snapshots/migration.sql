CREATE TABLE "pending_snapshot_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "previousEventId" UUID NOT NULL,
  "envelope" TEXT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "pending_snapshot_event_previousEventId_idx"
ON "pending_snapshot_event"("previousEventId");
