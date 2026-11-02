import { EventProducerSchema, EventTypeSchema } from '@event-sharing/contracts';
import { z } from 'zod';

export const EventLogListQuerySchema = z
  .strictObject({
    eventType: EventTypeSchema.optional(),
    producer: EventProducerSchema.optional(),
    actorId: z.uuid().optional(),
    relatedEventId: z.uuid().optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(30),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: 'The start date must be before the end date.',
    path: ['to'],
  });

export const EventLogAnalyticsQuerySchema = z.strictObject({
  days: z.coerce
    .number()
    .int()
    .refine((value) => [7, 30, 90].includes(value))
    .default(30),
});

export type EventLogListQuery = z.infer<typeof EventLogListQuerySchema>;
