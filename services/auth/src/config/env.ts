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
  BETTER_AUTH_PUBLIC_URL: z.url(),
  FRONTEND_ORIGIN: z.url(),
  EVENTS_SERVICE_URL: z.url().default('http://127.0.0.1:8001'),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_JWT_AUDIENCE: z.string().min(1).default('event-sharing-services'),
  KAFKA_BROKERS: z.string().min(1).optional(),
  MAIL_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  MAIL_DELIVERY_ENABLED: z.enum(['true', 'false']).default('false'),
}).superRefine((value, context) => {
  for (const provider of ['GOOGLE', 'GITHUB'] as const) {
    const clientId = value[`${provider}_CLIENT_ID`];
    const clientSecret = value[`${provider}_CLIENT_SECRET`];
    if (Boolean(clientId) !== Boolean(clientSecret)) {
      context.addIssue({
        code: 'custom',
        path: [`${provider}_CLIENT_SECRET`],
        message: `${provider} requires both client ID and secret.`,
      });
    }
  }
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
