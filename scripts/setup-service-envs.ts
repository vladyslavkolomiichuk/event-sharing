import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  chmodSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootEnvPath = resolve(root, '.env');

if (!existsSync(rootEnvPath)) {
  throw new Error('The root .env file is required before service setup.');
}

const rootEnv = parse(readFileSync(rootEnvPath));
const authEnvPath = resolve(root, 'services', 'auth', '.env');
const notificationsEnvPath = resolve(root, 'services', 'notifications', '.env');
const existingAuth = existsSync(authEnvPath)
  ? parse(readFileSync(authEnvPath))
  : {};
const existingNotifications = existsSync(notificationsEnvPath)
  ? parse(readFileSync(notificationsEnvPath))
  : {};
if (
  existingAuth.MAIL_ENCRYPTION_KEY &&
  existingNotifications.MAIL_ENCRYPTION_KEY &&
  existingAuth.MAIL_ENCRYPTION_KEY !== existingNotifications.MAIL_ENCRYPTION_KEY
) {
  throw new Error('Auth and Notifications mail encryption keys differ.');
}
const mailEncryptionKey =
  existingAuth.MAIL_ENCRYPTION_KEY ??
  existingNotifications.MAIL_ENCRYPTION_KEY ??
  randomBytes(32).toString('hex');
const username = rootEnv.POSTGRES_USER;
const password = rootEnv.POSTGRES_PASSWORD;
const port = rootEnv.POSTGRES_PORT ?? '5434';

if (!username || !password || !/^\d+$/.test(port)) {
  throw new Error('The root .env must define valid PostgreSQL settings.');
}

const services = [
  ['auth', 8002, 'auth_db'],
  ['users', 8003, 'users_db'],
  ['events', 8001, 'events_db'],
  ['geo-search', 8004, 'geo_search_db'],
  ['participation', 8005, 'participation_db'],
  ['notifications', 8006, 'notifications_db'],
  ['messages', 8008, 'messages_db'],
  ['event-log', 8007, 'event_log_db'],
  ['storage', 8009, 'storage_db'],
] as const;

function createEnvFile(path: string, content: string): void {
  if (existsSync(path)) {
    chmodSync(path, 0o600);
    console.info(`Skipped existing ${path}.`);
    return;
  }

  writeFileSync(path, content, { mode: 0o600, flag: 'wx' });
  chmodSync(path, 0o600);
  console.info(`Created ${path}.`);
}

function ensureEnvKeys(path: string, values: Record<string, string>): void {
  const content = readFileSync(path, 'utf8');
  const current = parse(content);
  const missing = Object.entries(values).filter(
    ([key]) => current[key] === undefined,
  );
  if (missing.length === 0) {
    return;
  }

  const prefix = content.endsWith('\n') ? '' : '\n';
  appendFileSync(
    path,
    `${prefix}${missing.map(([key, value]) => `${key}=${value}`).join('\n')}\n`,
  );
  chmodSync(path, 0o600);
  console.info(`Added missing settings to ${path}.`);
}

const authSettings = {
  HOST: '127.0.0.1',
  BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
  BETTER_AUTH_URL: 'http://127.0.0.1:8000',
  FRONTEND_ORIGIN: 'http://127.0.0.1:3001',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  MAIL_ENCRYPTION_KEY: mailEncryptionKey,
  MAIL_DELIVERY_ENABLED: 'false',
};

const notificationsSettings = {
  HOST: '127.0.0.1',
  KAFKA_BROKERS: '127.0.0.1:9092',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  MAIL_ENCRYPTION_KEY: mailEncryptionKey,
};

const usersSettings = {
  HOST: '127.0.0.1',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  KAFKA_BROKERS: '127.0.0.1:9092',
};

const participationSettings = {
  HOST: '127.0.0.1',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  KAFKA_BROKERS: '127.0.0.1:9092',
};

const eventsSettings = {
  HOST: '127.0.0.1',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  KAFKA_BROKERS: '127.0.0.1:9092',
};

const geoSearchSettings = {
  HOST: '127.0.0.1',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  KAFKA_BROKERS: '127.0.0.1:9092',
};

const eventLogSettings = {
  HOST: '127.0.0.1',
  KAFKA_BROKERS: '127.0.0.1:9092',
  AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
  AUTH_JWT_AUDIENCE: 'event-sharing-services',
  EVENT_LOG_RETENTION_DAYS: '365',
};

for (const [service, servicePort, database] of services) {
  const url = new URL(`postgresql://127.0.0.1:${port}/${database}`);
  url.username = username;
  url.password = password;

  let settings: Record<string, string> = {};
  if (service === 'auth') settings = authSettings;
  if (service === 'users') settings = usersSettings;
  if (service === 'participation') settings = participationSettings;
  if (service === 'events') settings = eventsSettings;
  if (service === 'geo-search') settings = geoSearchSettings;
  if (service === 'event-log') settings = eventLogSettings;
  if (service === 'notifications') settings = notificationsSettings;
  if (service === 'storage')
    settings = {
      HOST: '127.0.0.1',
      AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
      AUTH_JWT_AUDIENCE: 'event-sharing-services',
      EVENTS_SERVICE_URL: 'http://127.0.0.1:8001',
      STORAGE_PATH: './storage-data',
      STORAGE_BACKUP_PATH: './storage-backups',
      CLAMAV_HOST: '127.0.0.1',
      CLAMAV_PORT: '3310',
    };
  if (service === 'messages')
    settings = {
      HOST: '127.0.0.1',
      KAFKA_BROKERS: '127.0.0.1:9092',
      AUTH_JWT_ISSUER: 'http://127.0.0.1:8000',
      AUTH_JWT_AUDIENCE: 'event-sharing-services',
    };
  const additionalSettings = Object.entries(settings)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const serviceEnvPath = resolve(root, 'services', service, '.env');
  createEnvFile(
    serviceEnvPath,
    `NODE_ENV=development\nPORT=${servicePort}\nDATABASE_URL=${url.toString()}\n${additionalSettings}\n`,
  );

  if (service === 'auth') {
    ensureEnvKeys(serviceEnvPath, authSettings);
  } else if (service === 'users') {
    ensureEnvKeys(serviceEnvPath, usersSettings);
  } else if (service === 'participation') {
    ensureEnvKeys(serviceEnvPath, participationSettings);
  } else if (service === 'events') {
    ensureEnvKeys(serviceEnvPath, eventsSettings);
  } else if (service === 'geo-search') {
    ensureEnvKeys(serviceEnvPath, geoSearchSettings);
  } else if (service === 'event-log') {
    ensureEnvKeys(serviceEnvPath, eventLogSettings);
  } else if (service === 'notifications') {
    ensureEnvKeys(serviceEnvPath, notificationsSettings);
  } else if (service === 'messages') {
    ensureEnvKeys(serviceEnvPath, settings);
  }
}

const gatewayEnvPath = resolve(root, 'apps', 'gateway', '.env');
createEnvFile(
  gatewayEnvPath,
  [
    'NODE_ENV=development',
    'PORT=8000',
    'FRONTEND_ORIGIN=http://127.0.0.1:3001',
    'AUTH_SERVICE_URL=http://127.0.0.1:8002',
    'USERS_SERVICE_URL=http://127.0.0.1:8003',
    'EVENTS_SERVICE_URL=http://127.0.0.1:8001',
    'GEO_SEARCH_SERVICE_URL=http://127.0.0.1:8004',
    'PARTICIPATION_SERVICE_URL=http://127.0.0.1:8005',
    'NOTIFICATIONS_SERVICE_URL=http://127.0.0.1:8006',
    'MESSAGES_SERVICE_URL=http://127.0.0.1:8008',
    'EVENT_LOG_SERVICE_URL=http://127.0.0.1:8007',
    'STORAGE_SERVICE_URL=http://127.0.0.1:8009',
    '',
  ].join('\n'),
);

ensureEnvKeys(gatewayEnvPath, {
  FRONTEND_ORIGIN: 'http://127.0.0.1:3001',
  MESSAGES_SERVICE_URL: 'http://127.0.0.1:8008',
  STORAGE_SERVICE_URL: 'http://127.0.0.1:8009',
});

const databasePasswords = [
  'AUTH',
  'USERS',
  'EVENTS',
  'GEO_SEARCH',
  'PARTICIPATION',
  'NOTIFICATIONS',
  'MESSAGES',
  'EVENT_LOG',
  'STORAGE',
].map((name) => [`${name}_DB_PASSWORD`, randomBytes(24).toString('hex')]);
ensureEnvKeys(rootEnvPath, Object.fromEntries(databasePasswords));

await import('./setup-service-bus.js');
