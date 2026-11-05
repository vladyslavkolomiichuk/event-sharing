ALTER TABLE "chat_message" ALTER COLUMN "senderId" DROP NOT NULL;
ALTER TABLE "chat_message" ALTER COLUMN "clientMessageId" DROP NOT NULL;

CREATE TABLE "deleted_chat_user" (
  "userId" UUID NOT NULL,
  "deletedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deleted_chat_user_pkey" PRIMARY KEY ("userId")
);
