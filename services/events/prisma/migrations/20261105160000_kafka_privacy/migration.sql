CREATE TABLE privacy_deleted_user ("userId" uuid PRIMARY KEY, "deletedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE privacy_deleted_event ("eventId" uuid PRIMARY KEY, "deletedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE privacy_receipt (
  "requestId" uuid NOT NULL,
  operation text NOT NULL,
  result text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("requestId", operation)
);

CREATE TABLE privacy_deleted_mail (id uuid PRIMARY KEY);
CREATE TABLE privacy_export_snapshot (
  "requestId" uuid NOT NULL, "userId" uuid NOT NULL, collection integer NOT NULL, "offset" integer NOT NULL, data text NOT NULL, "expiresAt" timestamptz NOT NULL, PRIMARY KEY ("requestId", collection, "offset")
);
CREATE INDEX ON privacy_export_snapshot ("expiresAt");
CREATE INDEX ON privacy_export_snapshot ("userId");

CREATE FUNCTION privacy_guard_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE field text; identity text;
BEGIN
  PERFORM pg_advisory_xact_lock_shared(194727202);
  FOREACH field IN ARRAY TG_ARGV LOOP
    identity := to_jsonb(NEW) ->> field;
    IF identity IS NOT NULL AND EXISTS (SELECT 1 FROM privacy_deleted_user WHERE "userId" = identity::uuid) THEN
      RAISE EXCEPTION 'This account is no longer available';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON event FOR EACH ROW EXECUTE FUNCTION privacy_guard_write('organizerId');
CREATE TRIGGER privacy_guard BEFORE INSERT OR UPDATE ON participant_access FOR EACH ROW EXECUTE FUNCTION privacy_guard_write('userId');
