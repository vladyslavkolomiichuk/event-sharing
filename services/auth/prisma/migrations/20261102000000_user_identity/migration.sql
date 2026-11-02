ALTER TABLE "user" ADD COLUMN "username" text;

UPDATE "user"
SET "username" = 'user_' || left(replace(gen_random_uuid()::text, '-', ''), 24);

CREATE FUNCTION auth_default_username() RETURNS trigger AS $$
BEGIN
  IF NEW."username" IS NULL THEN
    NEW."username" := 'user_' || left(replace(gen_random_uuid()::text, '-', ''), 24);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_user_default_username
BEFORE INSERT ON "user"
FOR EACH ROW EXECUTE FUNCTION auth_default_username();

ALTER TABLE "user" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "user" ADD CONSTRAINT "user_username_format_check"
CHECK ("username" ~ '^[a-z][a-z0-9_]{2,29}$');
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

DROP TRIGGER auth_user_outbox_role_update ON "user";
DROP TRIGGER auth_user_outbox_name_update ON "user";

CREATE OR REPLACE FUNCTION auth_user_outbox_event() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
    VALUES (
      gen_random_uuid(), NEW."id", 'user.registered',
      jsonb_build_object('userId', NEW."id", 'role', NEW."role", 'name', NEW."name", 'username', NEW."username"),
      CURRENT_TIMESTAMP
    );
  ELSE
    IF OLD."role" IS DISTINCT FROM NEW."role" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (
        gen_random_uuid(), NEW."id", 'user.role.changed',
        jsonb_build_object('userId', NEW."id", 'role', NEW."role"), CURRENT_TIMESTAMP
      );
    END IF;

    IF OLD."name" IS DISTINCT FROM NEW."name" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (
        gen_random_uuid(), NEW."id", 'user.name.updated',
        jsonb_build_object('userId', NEW."id", 'name', NEW."name"), CURRENT_TIMESTAMP
      );
    END IF;

    IF OLD."username" IS DISTINCT FROM NEW."username" THEN
      INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
      VALUES (
        gen_random_uuid(), NEW."id", 'user.username.updated',
        jsonb_build_object('userId', NEW."id", 'username', NEW."username"), CURRENT_TIMESTAMP
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER auth_user_outbox_identity_update
AFTER UPDATE OF "role", "name", "username" ON "user"
FOR EACH ROW EXECUTE FUNCTION auth_user_outbox_event();

INSERT INTO "outbox_event" ("id", "aggregateId", "eventType", "payload", "occurredAt")
SELECT gen_random_uuid(), "id", 'user.username.updated',
  jsonb_build_object('userId', "id", 'username', "username"), CURRENT_TIMESTAMP
FROM "user";
