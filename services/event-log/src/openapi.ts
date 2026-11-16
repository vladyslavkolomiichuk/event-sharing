import {
  EventLogAnalyticsSchema,
  EventLogPageSchema,
  type ApiOperation,
} from '@event-sharing/contracts';
import {
  EventLogAnalyticsQuerySchema,
  EventLogListQuerySchema,
} from './schemas/event-log-query.schema.js';

const tag = 'Event log';

export const operations: ApiOperation[] = [
  {
    method: 'get',
    path: '/api/event-log/entries',
    tag,
    summary: 'Recorded domain events',
    access: 'admin',
    description: 'Stores an allowlist of fields, not whole payloads.',
    query: EventLogListQuerySchema,
    response: EventLogPageSchema,
  },
  {
    method: 'get',
    path: '/api/event-log/analytics',
    tag,
    summary: 'Platform analytics built from domain events',
    access: 'admin',
    query: EventLogAnalyticsQuerySchema,
    response: EventLogAnalyticsSchema,
  },
  {
    method: 'get',
    path: '/api/event-log/me/export',
    tag,
    summary: 'Export log entries about you',
    access: 'admin',
    description:
      'Gateway admits only admins here; account exports collect it internally.',
  },
];
