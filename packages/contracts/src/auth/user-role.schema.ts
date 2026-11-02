import { z } from 'zod';

export const UserRoleSchema = z.enum(['USER', 'ORGANIZER', 'ADMIN']);

export type UserRole = z.infer<typeof UserRoleSchema>;
