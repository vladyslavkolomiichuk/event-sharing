import { z } from 'zod';

export const HealthResponseSchema = z.strictObject({
  service: z.string().min(1),
  status: z.enum(['ok', 'unavailable']),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
