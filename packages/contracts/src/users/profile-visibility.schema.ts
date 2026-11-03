import { z } from 'zod';

export const ProfileVisibilitySchema = z.enum(['PUBLIC', 'FRIENDS', 'PRIVATE']);
export type ProfileVisibility = z.infer<typeof ProfileVisibilitySchema>;
