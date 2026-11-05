import { z } from 'zod';

export const DELETION_SERVICES = [
  'events-reservation',
  'participation',
  'events-cleanup',
  'messages',
  'notifications',
  'users',
  'storage',
  'geo-search',
  'event-log',
  'auth',
] as const;

export const DeletionServiceSchema = z.enum(DELETION_SERVICES);
export type DeletionService = z.infer<typeof DeletionServiceSchema>;
