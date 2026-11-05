import { z } from 'zod';
import { ServiceNameSchema } from '@event-sharing/contracts';

export const PortSchema = z.coerce.number().int().min(1).max(65535);

export const BaseHttpEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: PortSchema,
});

export const ServiceBusEnvSchema = z.object({
  SERVICE_BUS_KEYS: z
    .string()
    .transform((value, context) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        context.addIssue({
          code: 'custom',
          message: 'SERVICE_BUS_KEYS must be JSON.',
        });
        return z.NEVER;
      }
    })
    .pipe(z.record(ServiceNameSchema, z.string().regex(/^[a-f0-9]{64}$/i))),
  SERVICE_BUS_NAMESPACE: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .default('event-sharing'),
});

export const DatabaseServiceEnvSchema = BaseHttpEnvSchema.extend(
  ServiceBusEnvSchema.shape,
).extend({
  PRIVACY_SERVICE_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .optional(),
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'DATABASE_URL must use the PostgreSQL protocol.',
    ),
});
