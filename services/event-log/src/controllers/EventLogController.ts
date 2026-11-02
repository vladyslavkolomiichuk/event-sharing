import type { RequestHandler } from 'express';
import {
  EventLogAnalyticsQuerySchema,
  EventLogListQuerySchema,
} from '../schemas/event-log-query.schema.js';
import type { EventLogService } from '../services/EventLogService.js';

export class EventLogController {
  constructor(private readonly service: EventLogService) {}

  readonly list: RequestHandler = async (request, response) => {
    const query = EventLogListQuerySchema.parse(request.query);
    response.json(await this.service.list(query));
  };

  readonly analytics: RequestHandler = async (request, response) => {
    const { days } = EventLogAnalyticsQuerySchema.parse(request.query);
    response.json(await this.service.analytics(days));
  };
}
