CREATE TABLE "pending_policy_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "aggregateId" UUID NOT NULL,
  "policyVersion" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "pending_policy_event_aggregateId_policyVersion_key"
ON "pending_policy_event"("aggregateId", "policyVersion");
