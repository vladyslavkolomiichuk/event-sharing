import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

// An empty value means the secret is not set.
const optionalSecret = (prefix: string) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().startsWith(prefix).optional(),
  );

const EnvSchema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8005),
  HOST: z.string().min(1).default('127.0.0.1'),
  AUTH_JWT_ISSUER: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  FRONTEND_ORIGIN: z.url().default('http://127.0.0.1:3001'),
  STRIPE_SECRET_KEY: optionalSecret('sk_'),
  STRIPE_WEBHOOK_SECRET: optionalSecret('whsec_'),
  STRIPE_ACCOUNT_COUNTRY: z.string().length(2).default('NL'),
  PAYMENT_PLATFORM_FEE_PERCENT: z.coerce.number().min(0).max(50).default(0),
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
