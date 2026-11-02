import type { EventLogAnalytics, EventLogPage } from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export type EventLogFilters = {
  eventType?: string;
  producer?: string;
  actorId?: string;
  relatedEventId?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit?: number;
};

export class EventLogClient {
  analytics(days: 7 | 30 | 90): Promise<EventLogAnalytics> {
    return gateway.get(`/api/event-log/analytics?days=${days}`);
  }

  entries(filters: EventLogFilters): Promise<EventLogPage> {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') query.set(key, String(value));
    }
    return gateway.get(`/api/event-log/entries?${query}`);
  }
}

export const eventLogClient = new EventLogClient();
