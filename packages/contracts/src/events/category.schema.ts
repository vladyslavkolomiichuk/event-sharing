import { z } from 'zod';

export const CreateCategorySchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
});

export const CategorySchema = CreateCategorySchema.extend({
  id: z.uuid(),
});
