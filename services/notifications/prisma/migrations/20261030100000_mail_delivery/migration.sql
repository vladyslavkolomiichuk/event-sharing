CREATE TABLE "inbox_event" (
  "id" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbox_event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_delivery" (
  "id" UUID NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "sentAt" TIMESTAMPTZ(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_delivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "email_delivery_status_check" CHECK ("status" IN ('PENDING', 'RETRY', 'SENT', 'FAILED'))
);

CREATE INDEX "email_delivery_status_nextAttemptAt_idx"
ON "email_delivery"("status", "nextAttemptAt");
