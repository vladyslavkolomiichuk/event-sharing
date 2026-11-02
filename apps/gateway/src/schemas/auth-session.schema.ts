import { UserRoleSchema } from '@event-sharing/contracts';
import { z } from 'zod';

export const AuthSessionSchema = z.object({
  user: z.object({
    id: z.uuid(),
    role: UserRoleSchema,
  }),
});
