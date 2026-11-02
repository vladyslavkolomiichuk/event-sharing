import { z } from 'zod';

export const SearchPerformedPayloadSchema = z.strictObject({
  hasText: z.boolean(),
  hasCategory: z.boolean(),
  hasLocation: z.boolean(),
  resultCount: z.number().int().min(0).max(50),
});
