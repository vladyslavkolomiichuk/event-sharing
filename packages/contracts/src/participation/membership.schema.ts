import { z } from 'zod';
import { ParticipationStatusSchema } from './participation-status.schema.js';

export const MembershipSchema = z.strictObject({
  eventId: z.uuid(),
  userId: z.uuid(),
  status: ParticipationStatusSchema,
  joinedAt: z.iso.datetime(),
  leftAt: z.iso.datetime().nullable(),
});

export const MembershipListSchema = z.strictObject({
  items: z.array(MembershipSchema),
  nextCursor: z.uuid().nullable(),
});

export type Membership = z.infer<typeof MembershipSchema>;
export type MembershipList = z.infer<typeof MembershipListSchema>;
