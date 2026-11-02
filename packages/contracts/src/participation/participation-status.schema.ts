import { z } from 'zod';

export const ParticipationStatusSchema = z.enum([
  'JOINED',
  'LEFT',
  'CANCELLED',
]);

export type ParticipationStatus = z.infer<typeof ParticipationStatusSchema>;
