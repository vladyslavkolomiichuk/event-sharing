ALTER TABLE privacy_deletion_job ADD COLUMN "frozenAt" timestamptz;
ALTER TABLE privacy_deletion_job ADD COLUMN "confirmedAt" timestamptz;
ALTER TABLE privacy_deletion_job ADD COLUMN "receiptHash" text UNIQUE;
ALTER TABLE privacy_deletion_job ADD COLUMN "errorCode" text;
ALTER TABLE privacy_deletion_job ADD COLUMN context jsonb NOT NULL DEFAULT '{}';

CREATE FUNCTION prevent_deleted_account_session() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('privacy-auth:' || NEW."userId"::text, 0));
  IF EXISTS (SELECT 1 FROM privacy_deletion_job WHERE "userId" = NEW."userId" AND "frozenAt" IS NOT NULL) THEN
    RAISE EXCEPTION 'Account deletion is in progress';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_deleted_account_session BEFORE INSERT ON session
FOR EACH ROW EXECUTE FUNCTION prevent_deleted_account_session();

CREATE TABLE privacy_export_job (
  id uuid PRIMARY KEY,
  "userId" uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "expiresAt" timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  "completedAt" timestamptz
);
CREATE INDEX ON privacy_export_job ("userId", "createdAt");
CREATE TABLE privacy_export_source (
  "jobId" uuid NOT NULL REFERENCES privacy_export_job(id) ON DELETE CASCADE,
  service text NOT NULL,
  collection integer NOT NULL DEFAULT 0,
  "offset" integer NOT NULL DEFAULT 0,
  "completedAt" timestamptz,
  "nextAttemptAt" timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY ("jobId", service)
);
CREATE TABLE privacy_export_page (
  "jobId" uuid NOT NULL REFERENCES privacy_export_job(id) ON DELETE CASCADE,
  service text NOT NULL,
  collection integer NOT NULL,
  "offset" integer NOT NULL,
  data text NOT NULL,
  PRIMARY KEY ("jobId", service, collection, "offset")
);
