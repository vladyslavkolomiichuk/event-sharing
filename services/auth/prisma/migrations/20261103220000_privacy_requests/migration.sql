CREATE TABLE "privacy_request" (
  "id" UUID NOT NULL PRIMARY KEY,
  "userId" UUID NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(3),
  CONSTRAINT "privacy_request_status_check"
    CHECK ("status" IN ('PENDING', 'RESOLVED', 'REJECTED')),
  CONSTRAINT "privacy_request_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX "privacy_request_userId_requestedAt_idx"
  ON "privacy_request"("userId", "requestedAt");

CREATE UNIQUE INDEX "privacy_request_one_pending_per_user"
  ON "privacy_request"("userId") WHERE "status" = 'PENDING';
