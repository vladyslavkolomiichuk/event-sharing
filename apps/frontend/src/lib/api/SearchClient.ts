import type {
  EventMapResult,
  EventSearchQuery,
  EventSearchResult,
  SearchMode,
  SearchPreference,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class SearchClient {
  preference(): Promise<SearchPreference> {
    return gateway.get('/api/search/preference');
  }

  savePreference(mode: SearchMode): Promise<SearchPreference> {
    return gateway.put('/api/search/preference', { mode });
  }

  events(query: EventSearchQuery): Promise<EventSearchResult> {
    return gateway.post('/api/search/events', query);
  }

  mapPoints(query: EventSearchQuery): Promise<EventMapResult> {
    return gateway.post('/api/search/events/map', query);
  }
}

export const searchClient = new SearchClient();
