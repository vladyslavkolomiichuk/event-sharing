ALTER TABLE "user" ADD CONSTRAINT "user_username_reserved_check"
CHECK ("username" NOT IN (
  'admin', 'administrator', 'api', 'auth', 'events', 'friends',
  'help', 'login', 'logout', 'me', 'messages', 'notifications',
  'profile', 'search', 'settings', 'support', 'system', 'users'
));
