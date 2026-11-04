CREATE TABLE "organizer_request" (
  "id" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "reason" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING',
  "decisionReason" text,
  "decidedById" uuid,
  "requestedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "decidedAt" timestamptz(3),
  CONSTRAINT "organizer_request_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organizer_request_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "user"("id") ON DELETE CASCADE
);

CREATE INDEX "organizer_request_userId_requestedAt_idx"
  ON "organizer_request"("userId", "requestedAt");
CREATE INDEX "organizer_request_status_requestedAt_idx"
  ON "organizer_request"("status", "requestedAt");
CREATE UNIQUE INDEX "organizer_request_one_pending_per_user"
  ON "organizer_request"("userId") WHERE "status" = 'PENDING';
