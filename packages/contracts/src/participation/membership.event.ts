import { z } from 'zod';

export const MembershipEventPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  userId: z.uuid(),
});
