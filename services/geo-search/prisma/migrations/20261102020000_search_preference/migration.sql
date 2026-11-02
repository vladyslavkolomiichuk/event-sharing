CREATE TABLE "search_preference" (
  "userId" UUID NOT NULL PRIMARY KEY,
  "mode" TEXT NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "search_preference_mode_check"
    CHECK ("mode" IN ('DEVICE', 'CITY', 'ANYWHERE'))
);
