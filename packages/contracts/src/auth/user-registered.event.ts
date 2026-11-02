import { z } from 'zod';
import { UserRoleSchema } from './user-role.schema.js';
import { UsernameSchema } from './user-identity.schema.js';

export const UserRegisteredPayloadSchema = z.strictObject({
  userId: z.uuid(),
  role: UserRoleSchema,
  name: z.string().trim().min(1).optional(),
  username: UsernameSchema.optional(),
});

export type UserRegisteredPayload = z.infer<typeof UserRegisteredPayloadSchema>;
