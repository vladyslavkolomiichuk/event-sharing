CREATE TYPE "PricingMode" AS ENUM ('FREE', 'ONLINE', 'ON_SITE', 'DONATION');

ALTER TABLE "event"
  ADD COLUMN "pricingMode" "PricingMode" NOT NULL DEFAULT 'FREE',
  ADD COLUMN "priceCents" integer NOT NULL DEFAULT 0,
  ADD COLUMN "currency" text NOT NULL DEFAULT 'EUR',
  ADD COLUMN "refundHoursBeforeStart" integer,
  ADD CONSTRAINT "event_price_check" CHECK ("priceCents" BETWEEN 0 AND 1000000),
  ADD CONSTRAINT "event_currency_check" CHECK ("currency" IN ('EUR', 'USD', 'UAH'));
