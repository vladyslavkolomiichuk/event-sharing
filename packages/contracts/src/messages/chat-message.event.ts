import { z } from 'zod';

export const ChatMessageCreatedPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  roomId: z.uuid(),
  roomName: z.string(),
  messageId: z.uuid(),
  senderId: z.uuid(),
  recipientId: z.uuid().optional(),
});

export type ChatMessageCreatedPayload = z.infer<
  typeof ChatMessageCreatedPayloadSchema
>;
