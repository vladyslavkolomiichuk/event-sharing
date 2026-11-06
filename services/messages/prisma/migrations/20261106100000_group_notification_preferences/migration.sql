CREATE TABLE "chat_notification_preference" (
  "roomId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_notification_preference_pkey" PRIMARY KEY ("roomId", "userId"),
  CONSTRAINT "chat_notification_preference_roomId_fkey"
    FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "chat_notification_preference_userId_idx"
ON "chat_notification_preference"("userId");

CREATE TRIGGER privacy_guard
BEFORE INSERT OR UPDATE ON chat_notification_preference
FOR EACH ROW EXECUTE FUNCTION privacy_guard_write('userId');
