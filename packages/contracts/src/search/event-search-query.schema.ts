import { z } from 'zod';
import type { EventStatus } from '../events/event-status.schema.js';
import { SearchLocationSourceSchema } from './search-preference.schema.js';

export const SEARCHABLE_EVENT_STATUSES = [
  'PUBLISHED',
  'ONGOING',
] as const satisfies readonly EventStatus[];

export const SearchableEventStatusSchema = z.enum(SEARCHABLE_EVENT_STATUSES);
export const EventSearchStatusSchema = z.enum([
  ...SEARCHABLE_EVENT_STATUSES,
  'COMPLETED',
  'CANCELLED',
]);

export const EventSearchQuerySchema = z
  .strictObject({
    text: z.string().trim().max(200).optional(),
    categoryId: z.union([z.uuid(), z.literal('uncategorized')]).optional(),
    organizerId: z.uuid().optional(),
    status: EventSearchStatusSchema.optional(),
    startFrom: z.iso.datetime().optional(),
    startTo: z.iso.datetime().optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    radiusMeters: z.number().positive().max(100000).optional(),
    locationSource: SearchLocationSourceSchema.optional(),
    sort: z.enum(['distance', 'relevance', 'start_time']).default('start_time'),
    cursor: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  })
  .superRefine((query, context) => {
    const locationFields = [
      query.latitude,
      query.longitude,
      query.radiusMeters,
    ];
    const count = locationFields.filter((value) => value !== undefined).length;

    if (count !== 0 && count !== 3) {
      context.addIssue({
        code: 'custom',
        message: 'Latitude, longitude, and radius must be provided together.',
        path: ['latitude'],
      });
    }

    if (query.sort === 'distance' && count !== 3) {
      context.addIssue({
        code: 'custom',
        message: 'Distance sorting requires a search location.',
        path: ['sort'],
      });
    }
    if ((count === 3) !== (query.locationSource !== undefined)) {
      context.addIssue({
        code: 'custom',
        message: 'A location source is required only for location searches.',
        path: ['locationSource'],
      });
    }
    if (query.startFrom && query.startTo && query.startFrom > query.startTo) {
      context.addIssue({
        code: 'custom',
        message: 'Start date range is invalid.',
        path: ['startTo'],
      });
    }
  });

export type EventSearchQuery = z.infer<typeof EventSearchQuerySchema>;
