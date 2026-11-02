import type {
  EventSearchQuery,
  EventSearchResult,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class SearchClient {
  events(query: EventSearchQuery): Promise<EventSearchResult> {
    return gateway.post('/api/search/events', query);
  }
}

export const searchClient = new SearchClient();
