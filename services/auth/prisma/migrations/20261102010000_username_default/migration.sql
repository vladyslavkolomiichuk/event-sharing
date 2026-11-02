ALTER TABLE "user" ALTER COLUMN "username"
SET DEFAULT ('user_' || left(replace(gen_random_uuid()::text, '-', ''), 24));
