import { z } from 'zod';
import {
  EventPricingSchema,
  FREE_EVENT_PRICING,
} from '../events/event-pricing.schema.js';

export const AvailabilitySchema = z.strictObject({
  eventId: z.uuid(),
  status: z.enum(['OPEN', 'CLOSED', 'FULL', 'CANCELLED']),
  capacity: z.number().int().positive(),
  occupied: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  policyVersion: z.number().int().positive(),
  pricing: EventPricingSchema.default(FREE_EVENT_PRICING),
});

export type Availability = z.infer<typeof AvailabilitySchema>;
