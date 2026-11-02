import { z } from 'zod';
import { UsernameSchema } from './user-identity.schema.js';

export const UserUsernameUpdatedPayloadSchema = z.strictObject({
  userId: z.uuid(),
  username: UsernameSchema,
});

export type UserUsernameUpdatedPayload = z.infer<
  typeof UserUsernameUpdatedPayloadSchema
>;
