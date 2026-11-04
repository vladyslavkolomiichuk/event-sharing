import { z } from 'zod';

export const AvatarUrlSchema = z.union([
  z.url().max(2048),
  z
    .string()
    .regex(/^\/backend\/api\/storage\/profiles\/[0-9a-f-]{36}\/avatar$/i),
]);

export function profileAvatarPath(userId: string): string {
  return `/backend/api/storage/profiles/${userId}/avatar`;
}
