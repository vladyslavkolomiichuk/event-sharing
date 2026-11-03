ALTER TABLE "user_preference"
  ADD COLUMN "profileVisibility" TEXT NOT NULL DEFAULT 'PUBLIC',
  ADD COLUMN "discoverableByUsername" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "showParticipationHistory" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user_preference"
  ADD CONSTRAINT "user_preference_profile_visibility_check"
  CHECK ("profileVisibility" IN ('PUBLIC', 'FRIENDS', 'PRIVATE'));

ALTER TABLE "user_preference"
  ADD CONSTRAINT "user_preference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user_profile"("userId")
  ON DELETE CASCADE ON UPDATE CASCADE;
