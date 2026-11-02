import { z } from 'zod';

export const ListMembershipsQuerySchema = z.strictObject({
  cursor: z.uuid().optional(),
});
