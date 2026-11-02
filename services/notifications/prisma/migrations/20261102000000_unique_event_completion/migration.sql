CREATE UNIQUE INDEX "in_app_notification_event_completed_once"
ON "in_app_notification" ("recipientId", "eventId")
WHERE "type" = 'EVENT_COMPLETED';
