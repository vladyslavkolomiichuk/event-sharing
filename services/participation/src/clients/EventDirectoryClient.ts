import { EventDetailSchema } from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { InvitationError } from '../domain/errors/InvitationError.js';

export class EventDirectoryClient {
  async get(eventId: string, authorization: string) {
    const response = await fetch(
      `${env.EVENTS_SERVICE_URL}/api/events/${eventId}`,
      {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok)
      throw new InvitationError('Event not found.', 'EVENT_NOT_FOUND', 404);
    return EventDetailSchema.parse(await response.json());
  }
}
