import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const EnvSchema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8005),
  HOST: z.string().min(1).default('127.0.0.1'),
  AUTH_JWKS_URL: z.url(),
  AUTH_JWT_ISSUER: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  USERS_SERVICE_URL: z.url().default('http://127.0.0.1:8003'),
  EVENTS_SERVICE_URL: z.url().default('http://127.0.0.1:8001'),
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
