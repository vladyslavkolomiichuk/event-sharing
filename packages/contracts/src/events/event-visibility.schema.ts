import { z } from 'zod';

export const EventVisibilitySchema = z.enum([
  'PUBLIC',
  'UNLISTED',
  'INVITE_ONLY',
]);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;
