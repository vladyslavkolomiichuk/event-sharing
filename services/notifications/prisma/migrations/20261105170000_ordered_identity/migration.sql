CREATE TABLE ordered_delivery (
  id uuid PRIMARY KEY,
  stream text NOT NULL,
  "previousEventId" uuid,
  envelope text,
  "receivedAt" timestamptz NOT NULL DEFAULT now(),
  "processedAt" timestamptz
);
CREATE INDEX ON ordered_delivery (stream, "receivedAt") WHERE "processedAt" IS NULL;
