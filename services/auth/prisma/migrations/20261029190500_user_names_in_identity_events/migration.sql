CREATE OR REPLACE FUNCTION auth_user_outbox_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
    VALUES (
      gen_random_uuid(),
      NEW."id",
      'user.registered',
      jsonb_build_object('userId', NEW."id", 'role', NEW."role", 'name', NEW."name"),
      CURRENT_TIMESTAMP
    );
  ELSE
    IF OLD."role" IS DISTINCT FROM NEW."role" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (
        gen_random_uuid(),
        NEW."id",
        'user.role.changed',
        jsonb_build_object('userId', NEW."id", 'role', NEW."role"),
        CURRENT_TIMESTAMP
      );
    END IF;

    IF OLD."name" IS DISTINCT FROM NEW."name" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (
        gen_random_uuid(),
        NEW."id",
        'user.name.updated',
        jsonb_build_object('userId', NEW."id", 'name', NEW."name"),
        CURRENT_TIMESTAMP
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_user_outbox_name_update
AFTER UPDATE OF "name" ON "user"
FOR EACH ROW EXECUTE FUNCTION auth_user_outbox_event();

INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
SELECT gen_random_uuid(), "id", 'user.registered',
  jsonb_build_object('userId', "id", 'role', "role", 'name', "name"),
  CURRENT_TIMESTAMP
FROM "user";
