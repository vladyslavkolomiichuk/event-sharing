import {
  DatabaseServiceEnvSchema,
  PortSchema,
  loadServiceEnvFile,
} from '@event-sharing/common';
import { z } from 'zod';

const publicDemoUrl = 'https://valhalla1.openstreetmap.de';

const EnvSchema = DatabaseServiceEnvSchema.extend({
  PORT: PortSchema.default(8004),
  HOST: z.string().min(1).default('127.0.0.1'),
  AUTH_JWKS_URL: z.url(),
  AUTH_JWT_ISSUER: z.url(),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  KAFKA_BROKERS: z.string().min(1),
  EVENTS_SERVICE_URL: z.url().default('http://127.0.0.1:8001'),
  VALHALLA_URL: z.url().default(publicDemoUrl),
  VALHALLA_API_KEY: z.string().min(1).optional(),
  VALHALLA_CLIENT_ID: z.string().min(1).default('event-sharing-development'),
}).superRefine((value, context) => {
  if (
    value.NODE_ENV === 'production' &&
    value.VALHALLA_URL.replace(/\/$/, '') === publicDemoUrl
  ) {
    context.addIssue({
      code: 'custom',
      path: ['VALHALLA_URL'],
      message: 'Production routing requires a configured Valhalla server.',
    });
  }
  if (
    new URL(value.VALHALLA_URL).hostname === 'transit.land' &&
    !value.VALHALLA_API_KEY
  ) {
    context.addIssue({
      code: 'custom',
      path: ['VALHALLA_API_KEY'],
      message: 'Transitland routing requires an API key.',
    });
  }
});

export const env = EnvSchema.parse({
  ...loadServiceEnvFile(import.meta.url),
  ...process.env,
});
