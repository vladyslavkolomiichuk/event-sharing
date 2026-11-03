DROP TRIGGER IF EXISTS auth_user_default_username ON "user";
DROP FUNCTION IF EXISTS auth_default_username();
ALTER TABLE "user" ALTER COLUMN "username" DROP DEFAULT;
ALTER TABLE "user" ALTER COLUMN "username" DROP NOT NULL;

CREATE OR REPLACE FUNCTION auth_user_outbox_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
    VALUES (
      gen_random_uuid(), NEW."id", 'user.registered',
      jsonb_strip_nulls(jsonb_build_object(
        'userId', NEW."id", 'role', NEW."role", 'name', NEW."name", 'username', NEW."username"
      )), CURRENT_TIMESTAMP
    );
  ELSE
    IF OLD."role" IS DISTINCT FROM NEW."role" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (gen_random_uuid(), NEW."id", 'user.role.changed',
        jsonb_build_object('userId', NEW."id", 'role', NEW."role"), CURRENT_TIMESTAMP);
    END IF;
    IF OLD."name" IS DISTINCT FROM NEW."name" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (gen_random_uuid(), NEW."id", 'user.name.updated',
        jsonb_build_object('userId', NEW."id", 'name', NEW."name"), CURRENT_TIMESTAMP);
    END IF;
    IF OLD."username" IS DISTINCT FROM NEW."username" AND NEW."username" IS NOT NULL THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (gen_random_uuid(), NEW."id", 'user.username.updated',
        jsonb_build_object('userId', NEW."id", 'username', NEW."username", 'name', NEW."name"), CURRENT_TIMESTAMP);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
