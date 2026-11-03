import { z } from 'zod';
import { EventTypeSchema } from './event-types.js';

export const EventProducerSchema = z.enum([
  'auth',
  'users',
  'events',
  'geo-search',
  'participation',
  'notifications',
  'messages',
]);

export const EventEnvelopeSchema = z.strictObject({
  eventId: z.uuid(),
  eventType: EventTypeSchema,
  eventVersion: z.literal(1),
  occurredAt: z.iso.datetime(),
  correlationId: z.uuid(),
  producer: EventProducerSchema,
  payload: z.unknown(),
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;
export type EventProducer = z.infer<typeof EventProducerSchema>;
