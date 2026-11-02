import { z } from 'zod';

export const ListPublicProfilesQuerySchema = z.strictObject({
  ids: z
    .string()
    .min(1)
    .transform((value) => value.split(','))
    .pipe(z.array(z.uuid()).min(1).max(50)),
});
