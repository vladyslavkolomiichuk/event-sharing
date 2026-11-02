CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE "event_projection" (
  "id" UUID NOT NULL PRIMARY KEY,
  "organizerId" UUID NOT NULL,
  "categoryId" UUID,
  "categoryName" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "startTime" TIMESTAMPTZ(3) NOT NULL,
  "endTime" TIMESTAMPTZ(3) NOT NULL,
  "status" TEXT NOT NULL,
  "region" TEXT,
  "visibility" TEXT NOT NULL,
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "location" geography(Point,4326) GENERATED ALWAYS AS (
    CASE WHEN "latitude" IS NOT NULL AND "longitude" IS NOT NULL
      THEN ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
      ELSE NULL END
  ) STORED,
  "version" INTEGER NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "event_projection_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "event_projection_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE INDEX "event_projection_location_gist" ON "event_projection" USING GIST ("location");
CREATE INDEX "event_projection_title_trgm" ON "event_projection" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "event_projection_description_trgm" ON "event_projection" USING GIN ("description" gin_trgm_ops);
CREATE INDEX "event_projection_startTime_id_idx" ON "event_projection" ("startTime", "id");
CREATE INDEX "event_projection_categoryId_startTime_idx" ON "event_projection" ("categoryId", "startTime");
CREATE INDEX "event_projection_organizerId_startTime_idx" ON "event_projection" ("organizerId", "startTime");

CREATE TABLE "inbox_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "processedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "outbox_event" (
  "id" UUID NOT NULL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(3),
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX "outbox_event_publishedAt_occurredAt_idx" ON "outbox_event" ("publishedAt", "occurredAt");
