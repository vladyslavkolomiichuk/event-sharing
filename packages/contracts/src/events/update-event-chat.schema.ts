import { z } from 'zod';

export const UpdateEventChatSchema = z.strictObject({
  chatEnabled: z.boolean(),
});
