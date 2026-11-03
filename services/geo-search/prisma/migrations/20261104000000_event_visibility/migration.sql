ALTER TABLE "event_projection" ADD COLUMN "eventVisibility" text NOT NULL DEFAULT 'PUBLIC';
CREATE INDEX "event_projection_eventVisibility_status_startTime_idx" ON "event_projection"("eventVisibility", "status", "startTime");
