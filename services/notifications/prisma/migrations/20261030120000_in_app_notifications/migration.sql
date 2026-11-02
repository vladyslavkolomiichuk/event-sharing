CREATE TABLE "user_projection" (
  "id" UUID NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "user_projection_role_idx" ON "user_projection"("role");

CREATE TABLE "event_projection" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organizerId" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "lastSourceEventId" UUID NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "event_projection_organizerId_idx" ON "event_projection"("organizerId");

CREATE TABLE "membership_projection" (
  "eventId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "active" BOOLEAN NOT NULL,
  CONSTRAINT "membership_projection_pkey" PRIMARY KEY ("eventId", "userId")
);
CREATE INDEX "membership_projection_userId_idx" ON "membership_projection"("userId");

CREATE TABLE "in_app_notification" (
  "id" UUID NOT NULL PRIMARY KEY,
  "recipientId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "href" TEXT NOT NULL,
  "senderId" UUID,
  "eventId" UUID,
  "messageId" UUID,
  "sourceEventId" UUID,
  "readAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "in_app_notification_recipientId_sourceEventId_type_key"
ON "in_app_notification"("recipientId", "sourceEventId", "type");
CREATE INDEX "in_app_notification_recipientId_createdAt_id_idx"
ON "in_app_notification"("recipientId", "createdAt", "id");
CREATE INDEX "in_app_notification_recipientId_readAt_idx"
ON "in_app_notification"("recipientId", "readAt");

CREATE TABLE "in_app_message" (
  "id" UUID NOT NULL PRIMARY KEY,
  "senderId" UUID NOT NULL,
  "eventId" UUID,
  "body" TEXT NOT NULL,
  "recipientCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "in_app_message_senderId_createdAt_idx"
ON "in_app_message"("senderId", "createdAt");
