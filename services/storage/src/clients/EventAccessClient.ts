import { EventDetailSchema } from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { StorageError } from '../domain/StorageError.js';

export class EventAccessClient {
  async assertPublic(eventId: string): Promise<void> {
    let response: Response;
    try {
      response = await fetch(
        `${env.EVENTS_SERVICE_URL}/api/public/events/${eventId}/availability`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new StorageError(
        'Event access could not be checked.',
        'EVENTS_UNAVAILABLE',
        503,
      );
    }
    if (response.status === 404)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    if (response.status !== 204)
      throw new StorageError(
        'Event access could not be checked.',
        'EVENTS_UNAVAILABLE',
        503,
      );
  }

  async get(eventId: string, authorization: string) {
    let response: Response;
    try {
      response = await fetch(
        `${env.EVENTS_SERVICE_URL}/api/events/${eventId}`,
        {
          headers: { authorization },
          signal: AbortSignal.timeout(5000),
        },
      );
    } catch {
      throw new StorageError(
        'Event access could not be checked.',
        'EVENTS_UNAVAILABLE',
        503,
      );
    }
    if (response.status === 403 || response.status === 404)
      throw new StorageError('The file was not found.', 'NOT_FOUND', 404);
    if (!response.ok)
      throw new StorageError(
        'Event access could not be checked.',
        'EVENTS_UNAVAILABLE',
        503,
      );
    return EventDetailSchema.parse(await response.json());
  }
}
