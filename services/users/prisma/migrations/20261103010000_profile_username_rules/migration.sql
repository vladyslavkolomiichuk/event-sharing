ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_username_format_check"
CHECK ("username" ~ '^[a-z][a-z0-9_]{2,29}$');
