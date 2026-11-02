import { z } from 'zod';

export const EventStatusSchema = z.enum([
  'DRAFT',
  'MODERATION',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
]);

export type EventStatus = z.infer<typeof EventStatusSchema>;
