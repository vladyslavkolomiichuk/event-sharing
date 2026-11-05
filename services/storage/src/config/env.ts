import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const schema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8009),
  HOST: z.string().min(1).default('127.0.0.1'),
  KAFKA_BROKERS: z.string().min(1).default('127.0.0.1:9092'),
  AUTH_JWT_ISSUER: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  STORAGE_PATH: z.string().min(1),
  STORAGE_BACKUP_PATH: z.string().min(1),
  STORAGE_BACKUP_RETENTION_DAYS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3650)
    .default(30),
  STORAGE_MAX_FILE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(5242880)
    .default(5242880),
  STORAGE_USER_QUOTA_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(52428800),
  CLAMAV_HOST: z.string().min(1),
  CLAMAV_PORT: PortSchema.default(3310),
});

export const env = schema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
