ALTER TABLE "user_preference" ADD COLUMN "allowFriendRequests" boolean NOT NULL DEFAULT true;

CREATE TABLE "friend_request" (
  "id" uuid NOT NULL,
  "senderId" uuid NOT NULL,
  "recipientId" uuid NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "friend_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "friend_request_distinct_check" CHECK ("senderId" <> "recipientId"),
  CONSTRAINT "friend_request_status_check" CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED'))
);
CREATE UNIQUE INDEX "friend_request_senderId_recipientId_key" ON "friend_request"("senderId", "recipientId");
CREATE INDEX "friend_request_recipientId_status_createdAt_idx" ON "friend_request"("recipientId", "status", "createdAt");
CREATE INDEX "friend_request_senderId_status_createdAt_idx" ON "friend_request"("senderId", "status", "createdAt");

CREATE TABLE "friendship" (
  "userIdA" uuid NOT NULL,
  "userIdB" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "friendship_pkey" PRIMARY KEY ("userIdA", "userIdB"),
  CONSTRAINT "friendship_order_check" CHECK ("userIdA" < "userIdB")
);
CREATE INDEX "friendship_userIdB_idx" ON "friendship"("userIdB");

CREATE TABLE "user_block" (
  "blockerId" uuid NOT NULL,
  "blockedId" uuid NOT NULL,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_block_pkey" PRIMARY KEY ("blockerId", "blockedId"),
  CONSTRAINT "user_block_distinct_check" CHECK ("blockerId" <> "blockedId")
);
CREATE INDEX "user_block_blockedId_idx" ON "user_block"("blockedId");

CREATE UNIQUE INDEX "user_profile_username_key" ON "user_profile"("username");
DROP INDEX "user_profile_username_idx";
