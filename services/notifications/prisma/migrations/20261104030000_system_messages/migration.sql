CREATE TABLE "system_message" (
  "id" UUID NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "audience" TEXT NOT NULL,
  "authorId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "system_message_createdAt_id_idx"
ON "system_message"("createdAt", "id");
