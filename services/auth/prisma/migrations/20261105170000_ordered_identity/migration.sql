ALTER TABLE outbox_event ADD COLUMN redacted boolean NOT NULL DEFAULT false;
ALTER TABLE outbox_event ADD COLUMN ordered boolean NOT NULL DEFAULT false;
ALTER TABLE outbox_event ADD COLUMN "previousEventId" uuid;
CREATE TABLE outbox_stream_head ("aggregateId" uuid PRIMARY KEY, "lastEventId" uuid);

DO $$
DECLARE item record; previous_id uuid;
BEGIN
  FOR item IN SELECT id, "aggregateId" FROM outbox_event WHERE "publishedAt" IS NULL AND "eventType" <> 'notification.requested' ORDER BY position LOOP
    INSERT INTO outbox_stream_head ("aggregateId") VALUES (item."aggregateId") ON CONFLICT DO NOTHING;
    SELECT "lastEventId" INTO previous_id FROM outbox_stream_head WHERE "aggregateId" = item."aggregateId";
    UPDATE outbox_event SET ordered = true, "previousEventId" = previous_id WHERE id = item.id;
    UPDATE outbox_stream_head SET "lastEventId" = item.id WHERE "aggregateId" = item."aggregateId";
  END LOOP;
END;
$$;

CREATE FUNCTION order_outbox_stream() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."eventType" = 'notification.requested' THEN RETURN NEW; END IF;
  INSERT INTO outbox_stream_head ("aggregateId") VALUES (NEW."aggregateId") ON CONFLICT DO NOTHING;
  SELECT "lastEventId" INTO NEW."previousEventId" FROM outbox_stream_head WHERE "aggregateId" = NEW."aggregateId" FOR UPDATE;
  NEW.ordered := true;
  UPDATE outbox_stream_head SET "lastEventId" = NEW.id WHERE "aggregateId" = NEW."aggregateId";
  RETURN NEW;
END;
$$;
CREATE TRIGGER outbox_stream_order BEFORE INSERT ON outbox_event FOR EACH ROW EXECUTE FUNCTION order_outbox_stream();
