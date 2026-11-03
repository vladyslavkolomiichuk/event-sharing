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
  BETTER_AUTH_PUBLIC_URL: z.url().optional(),
  FRONTEND_ORIGIN: z.url(),
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
  if (
    (value.GOOGLE_CLIENT_ID || value.GITHUB_CLIENT_ID) &&
    !value.BETTER_AUTH_PUBLIC_URL
  ) {
    context.addIssue({
      code: 'custom',
      path: ['BETTER_AUTH_PUBLIC_URL'],
      message: 'OAuth requires the public frontend auth URL.',
    });
  }
  if (value.BETTER_AUTH_PUBLIC_URL) {
    const publicUrl = new URL(value.BETTER_AUTH_PUBLIC_URL);
    if (
      publicUrl.origin !== new URL(value.FRONTEND_ORIGIN).origin ||
      publicUrl.pathname.replace(/\/$/, '') !== '/backend/auth'
    ) {
      context.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_PUBLIC_URL'],
        message: 'The public auth URL must be FRONTEND_ORIGIN/backend/auth.',
      });
    }
  }
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
