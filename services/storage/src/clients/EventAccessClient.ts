import { EventDetailSchema, RPC_OPERATIONS } from '@event-sharing/contracts';
import { z } from 'zod';
import { serviceBus } from '../config/service-bus.js';
import { StorageError } from '../domain/StorageError.js';
export class EventAccessClient {
  async assertPublic(eventId: string): Promise<void> {
    const { visible } = z.object({ visible: z.boolean() }).parse(
      await serviceBus.call('events', RPC_OPERATIONS.publicEvent, {
        eventId,
      }),
    );
    if (!visible)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
  }
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
