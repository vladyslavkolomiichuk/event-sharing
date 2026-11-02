import { z } from 'zod';
import { EventLocationSchema } from './event-location.schema.js';

export const CreateEventSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().min(1).max(10000),
    categoryId: z.uuid().nullable().optional(),
    startTime: z.iso.datetime(),
    endTime: z.iso.datetime(),
    location: EventLocationSchema,
    participantLimit: z.number().int().positive(),
    chatEnabled: z.boolean().default(false),
  })
  .refine((event) => Date.parse(event.endTime) > Date.parse(event.startTime), {
    message: 'End time must be after start time.',
    path: ['endTime'],
  });

export type CreateEvent = z.infer<typeof CreateEventSchema>;
