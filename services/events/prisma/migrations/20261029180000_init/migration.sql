CREATE TYPE "EventStatus" AS ENUM ('DRAFT','MODERATION','REJECTED','APPROVED','PUBLISHED','REGISTRATION_OPEN','REGISTRATION_CLOSED','IN_PROGRESS','COMPLETED','CANCELLED','ARCHIVED');
CREATE TYPE "LocationVisibility" AS ENUM ('PUBLIC','PARTICIPANTS_ONLY');

CREATE TABLE "category" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "category_name_key" ON "category"("name");

CREATE TABLE "event" (
  "id" UUID NOT NULL,
  "organizerId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startTime" TIMESTAMPTZ(3) NOT NULL,
  "endTime" TIMESTAMPTZ(3) NOT NULL,
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "moderationReason" TEXT,
  "cancellationReason" TEXT,
  "locationAddress" TEXT NOT NULL,
  "locationRegion" TEXT,
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "locationVisibility" "LocationVisibility" NOT NULL DEFAULT 'PARTICIPANTS_ONLY',
  "participantLimit" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "policyVersion" INTEGER NOT NULL DEFAULT 0,
  "pendingPolicyVersion" INTEGER,
  "pendingStatus" "EventStatus",
  "pendingParticipantLimit" INTEGER,
  "pendingCancellationReason" TEXT,
  "policyError" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "event_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "event_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "event_time_check" CHECK ("endTime" > "startTime"),
  CONSTRAINT "event_capacity_check" CHECK ("participantLimit" > 0),
  CONSTRAINT "event_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "event_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "event_pending_check" CHECK (("pendingPolicyVersion" IS NULL AND "pendingStatus" IS NULL AND "pendingParticipantLimit" IS NULL) OR ("pendingPolicyVersion" IS NOT NULL AND "pendingStatus" IS NOT NULL AND "pendingParticipantLimit" IS NOT NULL))
);
CREATE INDEX "event_organizerId_id_idx" ON "event"("organizerId", "id");
CREATE INDEX "event_status_id_idx" ON "event"("status", "id");

CREATE TABLE "participant_access" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "participant_access_pkey" PRIMARY KEY ("eventId", "userId"),
  CONSTRAINT "participant_access_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "inbox_event" (
  "id" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inbox_event_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "outbox_event" (
  "id" UUID NOT NULL,
  "aggregateId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_event_publishedAt_occurredAt_idx" ON "outbox_event"("publishedAt", "occurredAt");
