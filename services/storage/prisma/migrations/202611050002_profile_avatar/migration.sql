ALTER TABLE "stored_file" ADD COLUMN "profileOwnerId" UUID;
CREATE UNIQUE INDEX "stored_file_profileOwnerId_key" ON "stored_file" ("profileOwnerId");
ALTER TABLE "stored_file" ADD CONSTRAINT "stored_file_profile_avatar_owner_check"
  CHECK ("profileOwnerId" IS NULL OR ("profileOwnerId" = "ownerId" AND "eventId" IS NULL AND "eventSlot" IS NULL));
