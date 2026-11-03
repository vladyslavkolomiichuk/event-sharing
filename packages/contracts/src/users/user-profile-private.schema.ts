import { z } from 'zod';
import { UserProfilePublicSchema } from './user-profile-public.schema.js';
import { ProfileVisibilitySchema } from './profile-visibility.schema.js';

export const UserProfilePrivateSchema = UserProfilePublicSchema.extend({
  version: z.number().int().positive(),
  preferences: z.strictObject({
    showPhone: z.boolean(),
    showCity: z.boolean(),
    notificationsEnabled: z.boolean(),
    allowFriendRequests: z.boolean(),
    allowInvitesFromStrangers: z.boolean(),
    profileVisibility: ProfileVisibilitySchema,
    discoverableByUsername: z.boolean(),
    showParticipationHistory: z.boolean(),
  }),
});

export type UserProfilePrivate = z.infer<typeof UserProfilePrivateSchema>;
