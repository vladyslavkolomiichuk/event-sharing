import { z } from 'zod';

export const ParticipationHistorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      eventId: z.uuid(),
      title: z.string(),
      endTime: z.iso.datetime(),
    }),
  ),
  nextPage: z.number().int().nonnegative().nullable(),
});

export type ParticipationHistory = z.infer<typeof ParticipationHistorySchema>;
