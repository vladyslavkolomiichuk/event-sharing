import { z } from 'zod';

export const EventReasonSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
