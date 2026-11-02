import { z } from 'zod';

export const UserProfileUpdatedPayloadSchema = z.strictObject({
  userId: z.uuid(),
  profileVersion: z.number().int().positive(),
  city: z.string().max(120).nullable(),
  notificationsEnabled: z.boolean(),
});

export type UserProfileUpdatedPayload = z.infer<
  typeof UserProfileUpdatedPayloadSchema
>;
