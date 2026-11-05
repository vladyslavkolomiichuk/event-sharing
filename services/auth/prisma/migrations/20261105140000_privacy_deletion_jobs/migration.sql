CREATE TABLE "privacy_deletion_job" (
  "requestId" UUID NOT NULL PRIMARY KEY,
  "userId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3)
);

CREATE TABLE "privacy_deletion_step" (
  "requestId" UUID NOT NULL,
  "service" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptAt" TIMESTAMPTZ(3),
  "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMPTZ(3),
  CONSTRAINT "privacy_deletion_step_pkey" PRIMARY KEY ("requestId", "service"),
  CONSTRAINT "privacy_deletion_step_position_key" UNIQUE ("requestId", "position"),
  CONSTRAINT "privacy_deletion_step_job_fkey"
    FOREIGN KEY ("requestId") REFERENCES "privacy_deletion_job"("requestId") ON DELETE CASCADE
);
