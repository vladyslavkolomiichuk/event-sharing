import { z } from 'zod';

export const EventLocationSchema = z.strictObject({
  address: z.string().trim().min(1).max(300),
  region: z.string().trim().max(100).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  visibility: z
    .enum(['PUBLIC', 'PARTICIPANTS_ONLY'])
    .default('PARTICIPANTS_ONLY'),
});

export type EventLocation = z.infer<typeof EventLocationSchema>;
