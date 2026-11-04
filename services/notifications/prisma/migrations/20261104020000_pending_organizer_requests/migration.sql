CREATE TABLE "pending_organizer_request" (
  "id" uuid NOT NULL,
  "requesterId" uuid NOT NULL,
  "requesterName" text NOT NULL,
  "sourceEventId" uuid NOT NULL,
  "receivedAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pending_organizer_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pending_organizer_request_receivedAt_idx"
  ON "pending_organizer_request"("receivedAt");
