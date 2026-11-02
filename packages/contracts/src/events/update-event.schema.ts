import { z } from 'zod';
import { EventLocationSchema } from './event-location.schema.js';

export const UpdateEventSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().min(1).max(10000).optional(),
    categoryId: z.uuid().nullable().optional(),
    startTime: z.iso.datetime().optional(),
    endTime: z.iso.datetime().optional(),
    location: EventLocationSchema.optional(),
    participantLimit: z.number().int().positive().optional(),
    chatEnabled: z.boolean().optional(),
  })
  .refine((event) => Object.keys(event).length > 0, {
    message: 'At least one event field is required.',
  });

export type UpdateEvent = z.infer<typeof UpdateEventSchema>;
