CREATE TABLE privacy_deleted_user ("userId" uuid PRIMARY KEY, "deletedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE privacy_deleted_event ("eventId" uuid PRIMARY KEY, "deletedAt" timestamptz NOT NULL DEFAULT now());
CREATE TABLE privacy_receipt (
  "requestId" uuid NOT NULL,
  operation text NOT NULL,
  result text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("requestId", operation)
);
ALTER TABLE inbox_event ADD COLUMN "eventType" text NOT NULL DEFAULT '';

CREATE TABLE privacy_deleted_mail (id uuid PRIMARY KEY);
CREATE TABLE privacy_export_snapshot (
  "requestId" uuid NOT NULL, "userId" uuid NOT NULL, collection integer NOT NULL, "offset" integer NOT NULL, data text NOT NULL, "expiresAt" timestamptz NOT NULL, PRIMARY KEY ("requestId", collection, "offset")
);
CREATE INDEX ON privacy_export_snapshot ("expiresAt");
CREATE INDEX ON privacy_export_snapshot ("userId");
