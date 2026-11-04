import {
  BaseHttpEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const EnvSchema = BaseHttpEnvSchema.extend({
  PORT: PortSchema.default(8000),
  FRONTEND_ORIGIN: z.url(),
  AUTH_SERVICE_URL: z.url(),
  USERS_SERVICE_URL: z.url(),
  EVENTS_SERVICE_URL: z.url(),
  GEO_SEARCH_SERVICE_URL: z.url(),
  PARTICIPATION_SERVICE_URL: z.url(),
  NOTIFICATIONS_SERVICE_URL: z.url(),
  MESSAGES_SERVICE_URL: z.url(),
  EVENT_LOG_SERVICE_URL: z.url(),
  STORAGE_SERVICE_URL: z.url().default('http://127.0.0.1:8009'),
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
