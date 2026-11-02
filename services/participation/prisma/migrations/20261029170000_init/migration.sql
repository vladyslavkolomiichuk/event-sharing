CREATE TYPE "RegistrationStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');
CREATE TYPE "MembershipStatus" AS ENUM ('JOINED', 'LEFT', 'CANCELLED');

CREATE TABLE "registration_policy" (
    "eventId" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "RegistrationStatus" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "occupied" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "registration_policy_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "registration_policy_capacity_check" CHECK ("capacity" > 0),
    CONSTRAINT "registration_policy_occupied_check" CHECK ("occupied" >= 0 AND "occupied" <= "capacity"),
    CONSTRAINT "registration_policy_version_check" CHECK ("version" > 0)
);

CREATE TABLE "membership" (
    "eventId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'JOINED',
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMPTZ(3),
    CONSTRAINT "membership_pkey" PRIMARY KEY ("eventId", "userId"),
    CONSTRAINT "membership_policy_fkey" FOREIGN KEY ("eventId") REFERENCES "registration_policy"("eventId") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "membership_userId_status_idx" ON "membership"("userId", "status");

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
