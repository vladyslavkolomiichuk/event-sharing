ALTER TABLE "user"
ADD CONSTRAINT "user_image_unused"
CHECK ("image" IS NULL);
