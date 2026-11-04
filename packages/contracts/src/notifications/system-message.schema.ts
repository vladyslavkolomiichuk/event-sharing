import { z } from 'zod';

export const SystemMessageAudienceSchema = z.enum([
  'ALL',
  'ORGANIZER',
  'ADMIN',
]);

export const CreateSystemMessageSchema = z.strictObject({
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(1).max(2000),
  audience: SystemMessageAudienceSchema,
});

export const SystemMessageSchema = CreateSystemMessageSchema.extend({
  id: z.uuid(),
  createdAt: z.iso.datetime(),
});

export const SystemMessageListSchema = z.strictObject({
  items: z.array(SystemMessageSchema),
  nextCursor: z.uuid().nullable(),
});

export type CreateSystemMessage = z.infer<typeof CreateSystemMessageSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type SystemMessageList = z.infer<typeof SystemMessageListSchema>;
