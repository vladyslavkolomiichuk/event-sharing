import { EventDetailSchema, RPC_OPERATIONS } from '@event-sharing/contracts';
import { serviceBus } from '../config/service-bus.js';
export class EventDirectoryClient {
  async get(eventId: string, authorization: string) {
    return EventDetailSchema.parse(
      await serviceBus.call(
        'events',
        RPC_OPERATIONS.eventDetail,
        { eventId },
        authorization,
      ),
    );
  }
}
