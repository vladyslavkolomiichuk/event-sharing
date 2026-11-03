import { z } from 'zod';

export const FriendEventPayloadSchema = z.strictObject({
  actorId: z.uuid(),
  recipientId: z.uuid(),
  actorName: z.string().min(1),
  actorUsername: z.string().min(3),
});

export type FriendEventPayload = z.infer<typeof FriendEventPayloadSchema>;
