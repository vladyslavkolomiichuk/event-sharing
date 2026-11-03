import {
  EventDetailSchema,
  EventSnapshotPayloadSchema,
  type EventDetail,
  type EventSnapshotPayload,
} from '@event-sharing/contracts';
import type { EventWithCategory } from '../models/EventWithCategory.js';

export class EventResponseFactory {
  detail(event: EventWithCategory, revealLocation: boolean): EventDetail {
    const publicVenueVisible =
      event.visibility !== 'INVITE_ONLY' &&
      event.locationVisibility === 'PUBLIC' &&
      ['PUBLISHED', 'ONGOING'].includes(event.status);
    const visible = revealLocation || publicVenueVisible;
    return EventDetailSchema.parse({
      id: event.id,
      organizerId: event.organizerId,
      categoryId: event.categoryId,
      categoryName: event.category?.name ?? null,
      title: event.title,
      description: event.description,
      startTime: event.startTime.toISOString(),
      endTime: event.endTime.toISOString(),
      timeZone: event.timeZone,
      status: event.status,
      registrationStatus: event.registrationStatus,
      participantLimit: event.participantLimit,
      chatEnabled: event.chatEnabled,
      visibility: event.visibility,
      version: event.version,
      pendingStatus: event.pendingStatus,
      pendingRegistrationStatus: event.pendingRegistrationStatus,
      pendingParticipantLimit: event.pendingParticipantLimit,
      policyError: event.policyError,
      moderationReason: event.moderationReason,
      cancellationReason: event.cancellationReason,
      location: {
        region: event.locationRegion,
        visibility: event.locationVisibility,
        address: visible ? event.locationAddress : null,
        latitude: visible ? Number(event.latitude) : null,
        longitude: visible ? Number(event.longitude) : null,
      },
      createdAt: event.createdAt.toISOString(),
      updatedAt: event.updatedAt.toISOString(),
    });
  }

  publicSnapshot(event: EventWithCategory): EventSnapshotPayload {
    const {
      moderationReason,
      policyError,
      pendingStatus,
      pendingRegistrationStatus,
      pendingParticipantLimit,
      ...snapshot
    } = this.detail(event, false);
    return EventSnapshotPayloadSchema.parse(snapshot);
  }
}
