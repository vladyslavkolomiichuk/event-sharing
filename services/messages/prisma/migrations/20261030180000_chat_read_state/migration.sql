ALTER TABLE "membership_projection" ADD COLUMN "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "chat_read_state" (
  "roomId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "lastReadAt" TIMESTAMPTZ(3) NOT NULL,
  "lastReadMessageId" UUID NOT NULL,
  CONSTRAINT "chat_read_state_pkey" PRIMARY KEY ("roomId", "userId"),
  CONSTRAINT "chat_read_state_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
