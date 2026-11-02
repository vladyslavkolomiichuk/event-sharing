import { z } from 'zod';

export const SearchPublicProfilesQuerySchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
});
