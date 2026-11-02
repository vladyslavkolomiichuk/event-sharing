import { z } from 'zod';
import { UserRoleSchema } from './user-role.schema.js';

export const InternalUserJwtClaimsSchema = z.object({
  sub: z.uuid(),
  iss: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
  jti: z.string().optional(),
  tokenUse: z.literal('internal-user-access'),
  role: UserRoleSchema,
});

export type InternalUserJwtClaims = z.infer<typeof InternalUserJwtClaimsSchema>;
