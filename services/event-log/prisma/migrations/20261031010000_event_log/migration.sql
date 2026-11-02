CREATE TABLE "event_log_entry" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "producer" TEXT NOT NULL,
  "topic" TEXT NOT NULL,
  "partition" INTEGER NOT NULL,
  "offset" BIGINT NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actorId" UUID,
  "subjectUserId" UUID,
  "relatedEventId" UUID,
  "summary" TEXT NOT NULL,
  "details" JSONB NOT NULL,
  CONSTRAINT "event_log_entry_topic_partition_offset_key" UNIQUE ("topic", "partition", "offset")
);
CREATE INDEX "event_log_entry_occurredAt_id_idx" ON "event_log_entry" ("occurredAt", "id");
CREATE INDEX "event_log_entry_eventType_occurredAt_idx" ON "event_log_entry" ("eventType", "occurredAt");
CREATE INDEX "event_log_entry_actorId_occurredAt_idx" ON "event_log_entry" ("actorId", "occurredAt");
CREATE INDEX "event_log_entry_subjectUserId_occurredAt_idx" ON "event_log_entry" ("subjectUserId", "occurredAt");
CREATE INDEX "event_log_entry_relatedEventId_occurredAt_idx" ON "event_log_entry" ("relatedEventId", "occurredAt");

CREATE TABLE "inbox_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "consumer_progress" (
  "topic" TEXT NOT NULL,
  "partition" INTEGER NOT NULL,
  "lastOffset" BIGINT NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("topic", "partition")
);
