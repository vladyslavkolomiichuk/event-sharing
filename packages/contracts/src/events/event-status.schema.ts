import { z } from 'zod';

export const EventStatusSchema = z.enum([
  'DRAFT',
  'MODERATION',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);

export type EventStatus = z.infer<typeof EventStatusSchema>;
