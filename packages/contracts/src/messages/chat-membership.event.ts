import { z } from 'zod';

export const ChatMembershipChangedPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  roomId: z.uuid(),
  roomName: z.string(),
  recipientId: z.uuid(),
  subjectId: z.uuid(),
  actorId: z.uuid(),
  change: z.enum(['ADDED', 'REMOVED']),
});

export type ChatMembershipChangedPayload = z.infer<
  typeof ChatMembershipChangedPayloadSchema
>;
