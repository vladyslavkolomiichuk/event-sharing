import {
  EventRouteResponseSchema,
  type EventRouteRequest,
} from '@event-sharing/contracts';
import { EventLocationClient } from '../clients/EventLocationClient.js';
import { ValhallaClient } from '../clients/ValhallaClient.js';

export class EventRouteService {
  constructor(
    private readonly events = new EventLocationClient(),
    private readonly routing = new ValhallaClient(),
  ) {}

  async route(input: EventRouteRequest, authorization: string) {
    const destination = await this.events.destination(
      input.eventId,
      authorization,
    );
    const route = await this.routing.route(
      input.origin,
      destination,
      input.mode,
    );
    return EventRouteResponseSchema.parse({
      eventId: input.eventId,
      origin: input.origin,
      destination,
      mode: input.mode,
      ...route,
    });
  }
}
