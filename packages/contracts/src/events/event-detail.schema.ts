import { z } from 'zod';
import { EventStatusSchema } from './event-status.schema.js';

export const EventDetailSchema = z.strictObject({
  id: z.uuid(),
  organizerId: z.uuid(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  title: z.string(),
  description: z.string(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  status: EventStatusSchema,
  participantLimit: z.number().int().positive(),
  chatEnabled: z.boolean().default(false),
  version: z.number().int().positive(),
  pendingStatus: EventStatusSchema.nullable(),
  pendingParticipantLimit: z.number().int().positive().nullable(),
  policyError: z.string().nullable(),
  moderationReason: z.string().nullable(),
  cancellationReason: z.string().nullable(),
  location: z.strictObject({
    region: z.string().nullable(),
    visibility: z.enum(['PUBLIC', 'PARTICIPANTS_ONLY']),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const EventListSchema = z.strictObject({
  items: z.array(EventDetailSchema),
  nextCursor: z.string().nullable(),
});

export type EventDetail = z.infer<typeof EventDetailSchema>;
