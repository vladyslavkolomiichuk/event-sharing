import { SERVICE_NAMES } from '@event-sharing/contracts';
import { vi } from 'vitest';

// Tests never read local .env files with development settings.
vi.mock('../packages/common/src/config/load-service-env-file.ts', () => ({
  loadServiceEnvFile: () => ({}),
}));

const key = (byte: string) => byte.repeat(32);

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
  SERVICE_BUS_KEYS: JSON.stringify(
    Object.fromEntries(SERVICE_NAMES.map((name) => [name, key('11')])),
  ),
  PRIVACY_SERVICE_KEY: key('22'),
  PRIVACY_SERVICE_KEYS: JSON.stringify(
    Object.fromEntries(SERVICE_NAMES.map((name) => [name, key('22')])),
  ),
  KAFKA_BROKERS: '127.0.0.1:1',
  AUTH_JWT_ISSUER: 'http://auth.test',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  BETTER_AUTH_SECRET: 's'.repeat(40),
  BETTER_AUTH_URL: 'http://auth.test',
  BETTER_AUTH_PUBLIC_URL: 'http://app.test/backend',
  FRONTEND_ORIGIN: 'http://app.test',
  MAIL_ENCRYPTION_KEY: key('33'),
  MAIL_DELIVERY_ENABLED: 'false',
  VALHALLA_URL: 'http://valhalla.test',
  STORAGE_PATH: '/nonexistent/storage',
  STORAGE_BACKUP_PATH: '/nonexistent/backups',
  CLAMAV_HOST: 'clamav.test',
  AUTH_SERVICE_URL: 'http://auth.test',
  USERS_SERVICE_URL: 'http://users.test',
  EVENTS_SERVICE_URL: 'http://events.test',
  GEO_SEARCH_SERVICE_URL: 'http://search.test',
  PARTICIPATION_SERVICE_URL: 'http://participation.test',
  NOTIFICATIONS_SERVICE_URL: 'http://notifications.test',
  MESSAGES_SERVICE_URL: 'http://messages.test',
  EVENT_LOG_SERVICE_URL: 'http://event-log.test',
  STORAGE_SERVICE_URL: 'http://storage.test',
});
for (const name of [
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASSWORD',
  'SMTP_FROM',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'VALHALLA_API_KEY',
]) {
  delete process.env[name];
}
