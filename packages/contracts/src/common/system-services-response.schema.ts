import { z } from 'zod';

export const SystemServiceStatusSchema = z.strictObject({
  service: z.string().min(1),
  status: z.enum(['ok', 'unavailable']),
});

export const SystemServicesResponseSchema = z.strictObject({
  services: z.array(SystemServiceStatusSchema),
});

export type SystemServicesResponse = z.infer<
  typeof SystemServicesResponseSchema
>;
