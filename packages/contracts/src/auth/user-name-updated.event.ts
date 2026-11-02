import { z } from 'zod';

export const UserNameUpdatedPayloadSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().trim().min(1),
});

export type UserNameUpdatedPayload = z.infer<
  typeof UserNameUpdatedPayloadSchema
>;
