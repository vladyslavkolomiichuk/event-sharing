import { z } from 'zod';

export const ListEventsQuerySchema = z.strictObject({
  cursor: z.string().min(1).max(512).optional(),
  categoryId: z.union([z.uuid(), z.literal('uncategorized')]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const ListOwnedEventsQuerySchema = ListEventsQuerySchema.omit({
  categoryId: true,
});
