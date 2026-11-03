import { z } from 'zod';
import { UsernameSchema } from './user-identity.schema.js';

export const UserUsernameUpdatedPayloadSchema = z.strictObject({
  userId: z.uuid(),
  username: UsernameSchema,
  name: z.string().trim().min(1).optional(),
});

export type UserUsernameUpdatedPayload = z.infer<
  typeof UserUsernameUpdatedPayloadSchema
>;
