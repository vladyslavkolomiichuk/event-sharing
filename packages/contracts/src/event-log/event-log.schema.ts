import { z } from 'zod';

export const EventLogEntrySchema = z.strictObject({
  id: z.uuid(),
  eventType: z.string(),
  producer: z.string(),
  topic: z.string(),
  occurredAt: z.iso.datetime(),
  receivedAt: z.iso.datetime(),
  actorId: z.uuid().nullable(),
  subjectUserId: z.uuid().nullable(),
  relatedEventId: z.uuid().nullable(),
  summary: z.string(),
  details: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

export const EventLogPageSchema = z.strictObject({
  items: z.array(EventLogEntrySchema),
  nextCursor: z.string().nullable(),
});

export const EventLogAnalyticsSchema = z.strictObject({
  days: z.number().int(),
  from: z.iso.datetime(),
  through: z.iso.datetime(),
  totals: z.record(z.string(), z.number().int().nonnegative()),
  activeActors: z.number().int().nonnegative(),
  search: z.strictObject({
    withLocation: z.number().int().nonnegative(),
    withText: z.number().int().nonnegative(),
    withCategory: z.number().int().nonnegative(),
    zeroResults: z.number().int().nonnegative(),
    resultsShown: z.number().int().nonnegative(),
  }),
  daily: z.array(
    z.strictObject({
      day: z.iso.date(),
      eventType: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
  categories: z.array(
    z.strictObject({ name: z.string(), count: z.number().int().nonnegative() }),
  ),
  eventStatuses: z.array(
    z.strictObject({ name: z.string(), count: z.number().int().nonnegative() }),
  ),
  progress: z.array(
    z.strictObject({
      topic: z.string(),
      partition: z.number().int(),
      lastOffset: z.string(),
      receivedAt: z.iso.datetime(),
    }),
  ),
});

export type EventLogEntry = z.infer<typeof EventLogEntrySchema>;
export type EventLogPage = z.infer<typeof EventLogPageSchema>;
export type EventLogAnalytics = z.infer<typeof EventLogAnalyticsSchema>;
