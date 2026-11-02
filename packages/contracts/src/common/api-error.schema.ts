import { z } from 'zod';

export const ApiErrorDetailSchema = z.strictObject({
  path: z.string(),
  message: z.string(),
});

export const ApiErrorSchema = z.strictObject({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.array(ApiErrorDetailSchema).default([]),
});

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;
