import { z } from 'zod';
import { EventStatusSchema } from '../events/event-status.schema.js';

export const SearchEventSchema = z.strictObject({
  id: z.uuid(),
  organizerId: z.uuid(),
  title: z.string(),
  description: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  status: EventStatusSchema,
  distanceMeters: z.number().nonnegative().nullable(),
  location: z.strictObject({
    region: z.string().nullable(),
    visibility: z.enum(['PUBLIC', 'PARTICIPANTS_ONLY']),
    address: z.string().nullable(),
    latitude: z.number().nullable(),
    longitude: z.number().nullable(),
  }),
});

export const EventSearchResultSchema = z.strictObject({
  items: z.array(SearchEventSchema),
  nextCursor: z.string().nullable(),
});

export type SearchEvent = z.infer<typeof SearchEventSchema>;
export type EventSearchResult = z.infer<typeof EventSearchResultSchema>;
