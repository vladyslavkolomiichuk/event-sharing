import { UserRoleSchema } from '@event-sharing/contracts';
import { z } from 'zod';

export const UpdateUserRoleSchema = z.strictObject({
  role: UserRoleSchema,
});
