ALTER TABLE "registration_policy" ADD COLUMN "title" text NOT NULL DEFAULT 'Event';
CREATE TABLE "invite_link" (
  "id" uuid NOT NULL,
  "eventId" uuid NOT NULL,
  "tokenHash" text NOT NULL,
  "createdBy" uuid NOT NULL,
  "expiresAt" timestamptz(3) NOT NULL,
  "maxUses" integer,
  "uses" integer NOT NULL DEFAULT 0,
  "revokedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "invite_link_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invite_link_max_uses_check" CHECK ("maxUses" IS NULL OR "maxUses" BETWEEN 1 AND 1000)
);
CREATE UNIQUE INDEX "invite_link_tokenHash_key" ON "invite_link"("tokenHash");
CREATE INDEX "invite_link_eventId_createdAt_idx" ON "invite_link"("eventId", "createdAt");

CREATE TABLE "personal_invite" (
  "id" uuid NOT NULL,
  "eventId" uuid NOT NULL,
  "recipientId" uuid NOT NULL,
  "senderId" uuid NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "notifiedAt" timestamptz(3),
  "expiresAt" timestamptz(3) NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "personal_invite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "personal_invite_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED'))
);
CREATE UNIQUE INDEX "personal_invite_eventId_recipientId_key" ON "personal_invite"("eventId", "recipientId");
CREATE INDEX "personal_invite_recipientId_status_createdAt_idx" ON "personal_invite"("recipientId", "status", "createdAt");
CREATE INDEX "personal_invite_eventId_createdAt_idx" ON "personal_invite"("eventId", "createdAt");
