import { z } from 'zod';

export const InvitationSentPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  recipientId: z.uuid(),
  organizerId: z.uuid(),
  title: z.string().min(1),
});
