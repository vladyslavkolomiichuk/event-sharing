import { z } from 'zod';
import { UserRoleSchema } from './user-role.schema.js';

export const UserRoleChangedPayloadSchema = z.strictObject({
  userId: z.uuid(),
  role: UserRoleSchema,
});

export type UserRoleChangedPayload = z.infer<
  typeof UserRoleChangedPayloadSchema
>;
