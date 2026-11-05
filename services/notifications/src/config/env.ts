import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const EnvSchema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8006),
  HOST: z.string().min(1).default('127.0.0.1'),
  KAFKA_BROKERS: z.string().min(1).optional(),
  AUTH_JWT_ISSUER: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  MAIL_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-f]{64}$/i)
    .optional(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: PortSchema.optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  SMTP_FROM: z.email().optional(),
}).superRefine((value, context) => {
  const hasSmtpSetting = Boolean(
    value.SMTP_HOST ||
    value.SMTP_PORT ||
    value.SMTP_FROM ||
    value.SMTP_USER ||
    value.SMTP_PASSWORD,
  );
  if (
    hasSmtpSetting &&
    (!value.SMTP_HOST || !value.SMTP_PORT || !value.SMTP_FROM)
  ) {
    context.addIssue({
      code: 'custom',
      message: 'SMTP_HOST, SMTP_PORT, and SMTP_FROM must be set together.',
      path: ['SMTP_HOST'],
    });
  }
  if (Boolean(value.SMTP_USER) !== Boolean(value.SMTP_PASSWORD)) {
    context.addIssue({
      code: 'custom',
      message: 'SMTP_USER and SMTP_PASSWORD must be set together.',
      path: ['SMTP_USER'],
    });
  }
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
