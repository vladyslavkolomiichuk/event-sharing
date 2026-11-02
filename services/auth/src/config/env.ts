import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const EnvSchema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8002),
  HOST: z.string().min(1).default('127.0.0.1'),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  FRONTEND_ORIGIN: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('event-sharing-services'),
  KAFKA_BROKERS: z.string().min(1).optional(),
  MAIL_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  MAIL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false'),
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
