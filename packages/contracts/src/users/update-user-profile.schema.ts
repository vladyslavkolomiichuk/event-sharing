import { z } from 'zod';
import { ProfileVisibilitySchema } from './profile-visibility.schema.js';

const UserPreferencesPatchSchema = z.strictObject({
  showPhone: z.boolean().optional(),
  showCity: z.boolean().optional(),
  notificationsEnabled: z.boolean().optional(),
  allowFriendRequests: z.boolean().optional(),
  allowInvitesFromStrangers: z.boolean().optional(),
  profileVisibility: ProfileVisibilitySchema.optional(),
  discoverableByUsername: z.boolean().optional(),
  showParticipationHistory: z.boolean().optional(),
});

export const UpdateUserProfileSchema = z
  .strictObject({
    avatarUrl: z.url().max(2048).nullable().optional(),
    bio: z.string().trim().max(1000).nullable().optional(),
    phone: z
      .string()
      .regex(/^\+[1-9]\d{1,14}$/, 'Phone must use E.164 format.')
      .nullable()
      .optional(),
    city: z.string().trim().min(1).max(120).nullable().optional(),
    preferences: UserPreferencesPatchSchema.optional(),
  })
  .refine((value) => {
    const hasProfileField = [
      value.avatarUrl,
      value.bio,
      value.phone,
      value.city,
    ].some((field) => field !== undefined);
    const hasPreference = Object.keys(value.preferences ?? {}).length > 0;
    return hasProfileField || hasPreference;
  }, 'At least one profile field is required.');

export type UpdateUserProfile = z.infer<typeof UpdateUserProfileSchema>;
