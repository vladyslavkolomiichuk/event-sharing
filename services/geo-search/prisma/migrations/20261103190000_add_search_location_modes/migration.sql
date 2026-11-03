ALTER TABLE "search_preference"
  DROP CONSTRAINT "search_preference_mode_check";

ALTER TABLE "search_preference"
  ADD CONSTRAINT "search_preference_mode_check"
  CHECK ("mode" IN ('DEVICE', 'CITY', 'ADDRESS', 'MAP', 'ANYWHERE'));
