import { z } from 'zod';
import { AvatarUrlSchema } from './avatar-url.schema.js';

export const UserProfilePublicSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().min(1),
  username: z.string().min(3),
  avatarUrl: AvatarUrlSchema.nullable(),
  bio: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  updatedAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type UserProfilePublic = z.infer<typeof UserProfilePublicSchema>;
