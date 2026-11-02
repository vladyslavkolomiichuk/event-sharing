ALTER TABLE "event" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "event" ALTER COLUMN "status" TYPE text USING "status"::text;
ALTER TABLE "event" ALTER COLUMN "pendingStatus" TYPE text USING "pendingStatus"::text;
DROP TYPE "EventStatus";

CREATE TYPE "EventStatus" AS ENUM (
  'DRAFT', 'MODERATION', 'REJECTED', 'APPROVED', 'PUBLISHED',
  'ONGOING', 'COMPLETED', 'CANCELLED', 'ARCHIVED'
);
CREATE TYPE "RegistrationState" AS ENUM ('OPEN', 'CLOSED');

ALTER TABLE "event" ADD COLUMN "registrationStatus" "RegistrationState" NOT NULL DEFAULT 'CLOSED';
ALTER TABLE "event" ADD COLUMN "pendingRegistrationStatus" "RegistrationState";

UPDATE "event" SET "registrationStatus" = 'OPEN'
WHERE "status" = 'REGISTRATION_OPEN';
UPDATE "event" SET "pendingRegistrationStatus" = 'OPEN'
WHERE "pendingStatus" = 'REGISTRATION_OPEN';
UPDATE "event" SET "pendingRegistrationStatus" = 'CLOSED'
WHERE "pendingStatus" = 'REGISTRATION_CLOSED';

UPDATE "event" SET "status" = 'ONGOING' WHERE "status" = 'IN_PROGRESS';
UPDATE "event" SET "status" = 'PUBLISHED'
WHERE "status" IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED');
UPDATE "event" SET "pendingStatus" = NULL
WHERE "pendingStatus" IN ('REGISTRATION_OPEN', 'REGISTRATION_CLOSED');
UPDATE "event" SET "pendingStatus" = 'ONGOING'
WHERE "pendingStatus" = 'IN_PROGRESS';
UPDATE "event" SET "pendingStatus" = "status"
WHERE "pendingPolicyVersion" IS NOT NULL AND "pendingStatus" IS NULL;

ALTER TABLE "event" ALTER COLUMN "status" TYPE "EventStatus" USING "status"::"EventStatus";
ALTER TABLE "event" ALTER COLUMN "pendingStatus" TYPE "EventStatus" USING "pendingStatus"::"EventStatus";
ALTER TABLE "event" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
