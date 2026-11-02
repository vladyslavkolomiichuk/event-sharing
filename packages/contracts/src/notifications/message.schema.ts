import { z } from 'zod';

export const SendEventMessageSchema = z.strictObject({
  body: z.string().trim().min(1).max(2000),
});

export const InAppMessageSchema = z.strictObject({
  id: z.uuid(),
  senderId: z.uuid(),
  senderName: z.string(),
  eventId: z.uuid().nullable(),
  body: z.string(),
  recipientCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});

export type InAppMessage = z.infer<typeof InAppMessageSchema>;
