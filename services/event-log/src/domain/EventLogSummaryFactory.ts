import {
  EVENT_TYPES,
  EventSnapshotPayloadSchema,
  MembershipEventPayloadSchema,
  NotificationDeliveryPayloadSchema,
  RegistrationPolicyAppliedPayloadSchema,
  RegistrationPolicyRejectedPayloadSchema,
  RegistrationPolicyRequestedPayloadSchema,
  SearchPerformedPayloadSchema,
  UserProfileUpdatedPayloadSchema,
  UserRegisteredPayloadSchema,
  UserRoleChangedPayloadSchema,
  isEventSnapshotType,
  UserNameUpdatedPayloadSchema,
  type EventEnvelope,
} from '@event-sharing/contracts';

type DetailValue = string | number | boolean | null;
export type EventLogSummary = {
  actorId: string | null;
  subjectUserId: string | null;
  relatedEventId: string | null;
  summary: string;
  details: Record<string, DetailValue>;
};

export class EventLogSummaryFactory {
  static create(event: EventEnvelope): EventLogSummary {
    const base: EventLogSummary = {
      actorId: null,
      subjectUserId: null,
      relatedEventId: null,
      summary: event.eventType.replaceAll('.', ' '),
      details: {},
    };

    if (event.eventType === EVENT_TYPES.userRegistered) {
      const payload = UserRegisteredPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          actorId: payload.data.userId,
          subjectUserId: payload.data.userId,
          details: { role: payload.data.role },
        };
    }
    if (event.eventType === EVENT_TYPES.userRoleChanged) {
      const payload = UserRoleChangedPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          subjectUserId: payload.data.userId,
          details: { role: payload.data.role },
        };
    }
    if (event.eventType === EVENT_TYPES.userNameUpdated) {
      const payload = UserNameUpdatedPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          actorId: payload.data.userId,
          subjectUserId: payload.data.userId,
        };
    }
    if (event.eventType === EVENT_TYPES.userProfileUpdated) {
      const payload = UserProfileUpdatedPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          actorId: payload.data.userId,
          subjectUserId: payload.data.userId,
          details: { profileVersion: payload.data.profileVersion },
        };
    }
    if (isEventSnapshotType(event.eventType)) {
      const payload = EventSnapshotPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          actorId:
            event.eventType === EVENT_TYPES.eventCreated
              ? payload.data.organizerId
              : null,
          subjectUserId: payload.data.organizerId,
          relatedEventId: payload.data.id,
          details: {
            status: payload.data.status,
            category: payload.data.categoryName ?? 'Uncategorized',
            version: payload.data.version,
          },
        };
    }
    if (event.eventType === EVENT_TYPES.registrationPolicyRequested) {
      const payload = RegistrationPolicyRequestedPayloadSchema.safeParse(
        event.payload,
      );
      if (payload.success)
        return {
          ...base,
          subjectUserId: payload.data.organizerId,
          relatedEventId: payload.data.eventId,
          details: {
            status: payload.data.status,
            policyVersion: payload.data.policyVersion,
          },
        };
    }
    if (event.eventType === EVENT_TYPES.registrationPolicyApplied) {
      const payload = RegistrationPolicyAppliedPayloadSchema.safeParse(
        event.payload,
      );
      if (payload.success)
        return {
          ...base,
          relatedEventId: payload.data.eventId,
          details: { policyVersion: payload.data.policyVersion },
        };
    }
    if (event.eventType === EVENT_TYPES.registrationPolicyRejected) {
      const payload = RegistrationPolicyRejectedPayloadSchema.safeParse(
        event.payload,
      );
      if (payload.success)
        return {
          ...base,
          relatedEventId: payload.data.eventId,
          details: {
            policyVersion: payload.data.policyVersion,
            reason: payload.data.reason,
          },
        };
    }
    if (
      event.eventType === EVENT_TYPES.userJoined ||
      event.eventType === EVENT_TYPES.userLeft
    ) {
      const payload = MembershipEventPayloadSchema.safeParse(event.payload);
      if (payload.success)
        return {
          ...base,
          actorId: payload.data.userId,
          subjectUserId: payload.data.userId,
          relatedEventId: payload.data.eventId,
        };
    }
    if (event.eventType === EVENT_TYPES.searchPerformed) {
      const payload = SearchPerformedPayloadSchema.safeParse(event.payload);
      if (payload.success) return { ...base, details: { ...payload.data } };
    }
    if (
      event.eventType === EVENT_TYPES.notificationSent ||
      event.eventType === EVENT_TYPES.notificationFailed
    ) {
      const payload = NotificationDeliveryPayloadSchema.safeParse(
        event.payload,
      );
      if (payload.success)
        return {
          ...base,
          details: {
            channel: payload.data.channel,
            reason: payload.data.reason ?? null,
          },
        };
    }

    return base;
  }
}
