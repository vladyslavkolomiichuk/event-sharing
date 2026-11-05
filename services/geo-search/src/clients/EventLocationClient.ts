import { EventDetailSchema, type RoutePoint } from '@event-sharing/contracts';
import { serviceBus } from '../config/service-bus.js';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { RouteError } from '../domain/errors/RouteError.js';

export class EventLocationClient {
  async destination(
    eventId: string,
    authorization: string,
  ): Promise<RoutePoint> {
    const event = EventDetailSchema.parse(
      await serviceBus.call(
        'events',
        RPC_OPERATIONS.eventDetail,
        { eventId },
        authorization,
      ),
    );
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
