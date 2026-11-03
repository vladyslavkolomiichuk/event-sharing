import type {
  EventRouteRequest,
  EventRouteResponse,
} from '@event-sharing/contracts';
import { gateway } from './GatewayClient';

export class EventRouteClient {
  route(
    input: EventRouteRequest,
    signal?: AbortSignal,
  ): Promise<EventRouteResponse> {
    return gateway.request('/api/search/route', {
      method: 'POST',
      body: JSON.stringify(input),
      signal,
    });
  }
}

export const eventRouteClient = new EventRouteClient();
