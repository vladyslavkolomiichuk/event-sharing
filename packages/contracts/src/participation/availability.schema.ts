import { z } from 'zod';

export const AvailabilitySchema = z.strictObject({
  eventId: z.uuid(),
  status: z.enum(['OPEN', 'CLOSED', 'FULL', 'CANCELLED']),
  capacity: z.number().int().positive(),
  occupied: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  policyVersion: z.number().int().positive(),
});

export type Availability = z.infer<typeof AvailabilitySchema>;
