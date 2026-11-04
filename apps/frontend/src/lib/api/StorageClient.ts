import { ApiError, gateway } from './GatewayClient';
import {
  EventImagesSchema,
  type EventImages,
  type EventImageSlot,
} from '@event-sharing/contracts';

export type { EventImageSlot } from '@event-sharing/contracts';

export class StorageClient {
  async images(eventId: string): Promise<EventImages> {
    return EventImagesSchema.parse(
      await gateway.get(`/api/storage/events/${eventId}`),
    );
  }

  async uploadEventImage(
    eventId: string,
    slot: EventImageSlot,
    file: File,
  ): Promise<void> {
    if (file.size > 5 * 1024 * 1024)
      throw new Error('Images must be 5 MB or smaller.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
      throw new Error('Use a PNG, JPEG, or WebP image.');
    const response = await fetch(
      `/backend/api/storage/events/${eventId}/${slot}`,
      {
        method: 'PUT',
        headers: { 'content-type': file.type },
        body: file,
        credentials: 'include',
      },
    );
    if (!response.ok) {
      const error = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
      } | null;
      throw new ApiError(
        response.status,
        error?.code ?? 'UPLOAD_FAILED',
        error?.message ?? 'Could not upload image.',
      );
    }
  }

  async removeEventImage(eventId: string, slot: EventImageSlot): Promise<void> {
    const response = await fetch(
      `/backend/api/storage/events/${eventId}/${slot}`,
      { method: 'DELETE', credentials: 'include' },
    );
    if (!response.ok && response.status !== 404)
      throw new Error('Could not remove image.');
  }
}

export const storageClient = new StorageClient();
