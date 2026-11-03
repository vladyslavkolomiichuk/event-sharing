import { z } from 'zod';
import { UserProfilePublicSchema } from './user-profile-public.schema.js';

export const UserProfilePrivateSchema = UserProfilePublicSchema.extend({
  version: z.number().int().positive(),
  preferences: z.strictObject({
    showPhone: z.boolean(),
    showCity: z.boolean(),
    notificationsEnabled: z.boolean(),
    allowFriendRequests: z.boolean(),
    allowInvitesFromStrangers: z.boolean(),
  }),
});

export type UserProfilePrivate = z.infer<typeof UserProfilePrivateSchema>;
