ALTER TABLE "user_profile" ADD COLUMN "username" text;
UPDATE "user_profile"
SET "username" = 'user_' || left(replace(gen_random_uuid()::text, '-', ''), 24);
ALTER TABLE "user_profile" ALTER COLUMN "username" SET NOT NULL;
CREATE INDEX "user_profile_username_idx" ON "user_profile"("username");
