import { z } from 'zod';

export const DisplayNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(
    /^[\p{L}\p{M}\p{N} .'-]+$/u,
    'Use letters, numbers, spaces, apostrophes, periods, or hyphens.',
  );

const reservedUsernames = new Set([
  'admin',
  'administrator',
  'api',
  'auth',
  'events',
  'friends',
  'help',
  'login',
  'logout',
  'me',
  'messages',
  'notifications',
  'profile',
  'search',
  'settings',
  'support',
  'system',
  'users',
]);

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^[a-z][a-z0-9_]{2,29}$/,
    'Use 3–30 lowercase letters, numbers, or underscores, starting with a letter.',
  )
  .refine(
    (value) => !reservedUsernames.has(value),
    'This username is reserved.',
  );

export const UpdateIdentitySchema = z
  .strictObject({
    name: DisplayNameSchema.optional(),
    username: UsernameSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.username !== undefined, {
    message: 'Provide a name or username.',
  });

export type UpdateIdentity = z.infer<typeof UpdateIdentitySchema>;
