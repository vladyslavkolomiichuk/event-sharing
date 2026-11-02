CREATE TABLE "outbox_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "aggregateId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "outbox_event_publishedAt_occurredAt_idx"
ON "outbox_event"("publishedAt", "occurredAt");
