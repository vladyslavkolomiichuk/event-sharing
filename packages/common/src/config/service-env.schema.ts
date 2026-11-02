import { z } from 'zod';

export const PortSchema = z.coerce.number().int().min(1).max(65535);

export const BaseHttpEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: PortSchema,
});

export const DatabaseServiceEnvSchema = BaseHttpEnvSchema.extend({
  DATABASE_URL: z
    .url()
    .refine(
      (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
      'DATABASE_URL must use the PostgreSQL protocol.',
    ),
});
