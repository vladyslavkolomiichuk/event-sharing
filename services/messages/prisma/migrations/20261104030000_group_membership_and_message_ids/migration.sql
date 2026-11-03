ALTER TABLE "chat_room" ADD COLUMN "access" TEXT NOT NULL DEFAULT 'ALL_PARTICIPANTS';

CREATE TABLE "chat_room_member" (
  "roomId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "joinedAt" TIMESTAMPTZ(3),
  "removedAt" TIMESTAMPTZ(3),
  CONSTRAINT "chat_room_member_pkey" PRIMARY KEY ("roomId", "userId"),
  CONSTRAINT "chat_room_member_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "chat_room_member_userId_status_idx" ON "chat_room_member"("userId", "status");

ALTER TABLE "chat_message" ADD COLUMN "clientMessageId" UUID;
UPDATE "chat_message" SET "clientMessageId" = gen_random_uuid();
ALTER TABLE "chat_message" ALTER COLUMN "clientMessageId" SET NOT NULL;
CREATE UNIQUE INDEX "chat_message_senderId_clientMessageId_key" ON "chat_message"("senderId", "clientMessageId");

CREATE TABLE "outbox_event" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "aggregateId" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "outbox_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbox_event_publishedAt_occurredAt_idx" ON "outbox_event"("publishedAt", "occurredAt");
