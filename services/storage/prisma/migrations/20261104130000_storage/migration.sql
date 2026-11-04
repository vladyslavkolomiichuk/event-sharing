CREATE TABLE "stored_file" (
  "id" UUID NOT NULL PRIMARY KEY,
  "ownerId" UUID NOT NULL,
  "eventId" UUID,
  "eventSlot" TEXT,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" > 0),
  "sha256" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_slot_check" CHECK (("eventId" IS NULL AND "eventSlot" IS NULL) OR ("eventId" IS NOT NULL AND "eventSlot" IN ('avatar', 'cover')))
);
CREATE INDEX "stored_file_ownerId_createdAt_idx" ON "stored_file"("ownerId", "createdAt");
CREATE UNIQUE INDEX "stored_file_eventId_eventSlot_key" ON "stored_file"("eventId", "eventSlot");
