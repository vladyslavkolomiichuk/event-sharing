import { z } from 'zod';
import { EventStatusSchema } from '../events/event-status.schema.js';
import { EventTimeZoneSchema } from '../events/event-time-zone.schema.js';

export const SearchEventSchema = z.strictObject({
  id: z.uuid(),
  organizerId: z.uuid(),
  title: z.string(),
  description: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  startTime: z.iso.datetime(),
  endTime: z.iso.datetime(),
  timeZone: EventTimeZoneSchema.default('UTC'),
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

// Upper bound that keeps one map response small.
export const EVENT_MAP_POINT_LIMIT = 2000;

export const EventMapPointSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  region: z.string().nullable(),
  visibility: z.enum(['PUBLIC', 'PARTICIPANTS_ONLY']),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});

export const EventMapResultSchema = z.strictObject({
  points: z.array(EventMapPointSchema).max(EVENT_MAP_POINT_LIMIT),
  total: z.number().int().nonnegative(),
});

export type SearchEvent = z.infer<typeof SearchEventSchema>;
export type EventSearchResult = z.infer<typeof EventSearchResultSchema>;
export type EventMapPoint = z.infer<typeof EventMapPointSchema>;
export type EventMapResult = z.infer<typeof EventMapResultSchema>;
