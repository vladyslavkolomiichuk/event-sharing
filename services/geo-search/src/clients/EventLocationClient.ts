import { EventDetailSchema, type RoutePoint } from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { RouteError } from '../domain/errors/RouteError.js';

export class EventLocationClient {
  async destination(
    eventId: string,
    authorization: string,
  ): Promise<RoutePoint> {
    const response = await fetch(
      `${env.EVENTS_SERVICE_URL}/api/events/${eventId}`,
      { headers: { authorization }, signal: AbortSignal.timeout(5000) },
    ).catch(() => {
      throw new RouteError(
        'Event location is unavailable.',
        'EVENT_UNAVAILABLE',
        503,
      );
    });
    if (!response.ok) {
      throw new RouteError(
        'Event is unavailable.',
        'EVENT_UNAVAILABLE',
        response.status === 404 ? 404 : 503,
      );
    }
    const event = EventDetailSchema.parse(await response.json());
    if (event.location.latitude === null || event.location.longitude === null) {
      throw new RouteError(
        'The exact venue is not available to you.',
        'VENUE_NOT_ACCESSIBLE',
        403,
      );
    }
    return {
      latitude: event.location.latitude,
      longitude: event.location.longitude,
    };
  }
}
