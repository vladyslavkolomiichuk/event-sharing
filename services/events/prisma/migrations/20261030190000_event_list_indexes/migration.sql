CREATE INDEX "event_createdAt_id_idx" ON "event"("createdAt", "id");
CREATE INDEX "event_organizerId_createdAt_id_idx" ON "event"("organizerId", "createdAt", "id");
CREATE INDEX "event_categoryId_createdAt_id_idx" ON "event"("categoryId", "createdAt", "id");
