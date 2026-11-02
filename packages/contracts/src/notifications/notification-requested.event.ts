import { z } from 'zod';

export const NotificationRequestedPayloadSchema = z.strictObject({
  iv: z.string().min(1),
  tag: z.string().min(1),
  ciphertext: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

export type NotificationRequestedPayload = z.infer<
  typeof NotificationRequestedPayloadSchema
>;
