ALTER TABLE "registration_policy"
  ADD COLUMN "startTime" timestamptz(3),
  ADD COLUMN "pricingMode" text NOT NULL DEFAULT 'FREE',
  ADD COLUMN "priceCents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "currency" text NOT NULL DEFAULT 'EUR',
  ADD COLUMN "refundHoursBeforeStart" integer,
  ADD CONSTRAINT "registration_policy_pricing_mode_check"
    CHECK ("pricingMode" IN ('FREE', 'ONLINE', 'ON_SITE', 'DONATION'));

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED');

CREATE TABLE "payment" (
  "id" uuid NOT NULL,
  "eventId" uuid NOT NULL,
  "userId" uuid NOT NULL,
  "organizerId" uuid NOT NULL,
  "amountCents" integer NOT NULL,
  "currency" text NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "held" boolean NOT NULL DEFAULT true,
  "expiresAt" timestamptz(3) NOT NULL,
  "inviteId" uuid,
  "inviteLinkId" uuid,
  "providerSessionId" text,
  "providerPaymentId" text,
  "checkoutUrl" text,
  "refundAttempts" integer NOT NULL DEFAULT 0,
  "paidAt" timestamptz(3),
  "refundedAt" timestamptz(3),
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_amount_check" CHECK ("amountCents" > 0)
);
CREATE UNIQUE INDEX "payment_providerSessionId_key" ON "payment"("providerSessionId");
CREATE INDEX "payment_eventId_userId_status_idx" ON "payment"("eventId", "userId", "status");
CREATE INDEX "payment_status_expiresAt_idx" ON "payment"("status", "expiresAt");
-- One open checkout per user and event.
CREATE UNIQUE INDEX "payment_one_pending_key" ON "payment"("eventId", "userId") WHERE "status" = 'PENDING';

CREATE TABLE "payout_account" (
  "userId" uuid NOT NULL,
  "providerAccountId" text NOT NULL,
  "chargesEnabled" boolean NOT NULL DEFAULT false,
  "detailsSubmitted" boolean NOT NULL DEFAULT false,
  "createdAt" timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamptz(3) NOT NULL,
  CONSTRAINT "payout_account_pkey" PRIMARY KEY ("userId")
);
CREATE UNIQUE INDEX "payout_account_providerAccountId_key" ON "payout_account"("providerAccountId");
