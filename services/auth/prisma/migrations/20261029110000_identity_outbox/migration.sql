ALTER TABLE "user"
ADD CONSTRAINT "user_role_valid"
CHECK ("role" IN ('USER', 'ORGANIZER', 'ADMIN'));

CREATE FUNCTION auth_user_outbox_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
    VALUES (
      gen_random_uuid(),
      NEW."id",
      'user.registered',
      jsonb_build_object('userId', NEW."id", 'role', NEW."role"),
      CURRENT_TIMESTAMP
    );
  ELSIF OLD."role" IS DISTINCT FROM NEW."role" THEN
    INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
    VALUES (
      gen_random_uuid(),
      NEW."id",
      'user.role.changed',
      jsonb_build_object('userId', NEW."id", 'role', NEW."role"),
      CURRENT_TIMESTAMP
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_user_outbox_insert
AFTER INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION auth_user_outbox_event();

CREATE TRIGGER auth_user_outbox_role_update
AFTER UPDATE OF "role" ON "user"
FOR EACH ROW EXECUTE FUNCTION auth_user_outbox_event();
