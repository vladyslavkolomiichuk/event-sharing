import { z } from 'zod';

export const EVENT_TYPES = {
  userRegistered: 'user.registered',
  userRoleChanged: 'user.role.changed',
  userProfileUpdated: 'user.profile.updated',
  userNameUpdated: 'user.name.updated',
  userUsernameUpdated: 'user.username.updated',
  organizerRequestSubmitted: 'organizer.request.submitted',
  organizerRequestResolved: 'organizer.request.resolved',
  friendRequested: 'friend.requested',
  friendAccepted: 'friend.accepted',
  invitationSent: 'invitation.sent',
  eventCreated: 'event.created',
  eventUpdated: 'event.updated',
  eventCancelled: 'event.cancelled',
  registrationPolicyRequested: 'registration.policy.requested',
  registrationPolicyApplied: 'registration.policy.applied',
  registrationPolicyRejected: 'registration.policy.rejected',
  userJoined: 'user.joined',
  userLeft: 'user.left',
  searchPerformed: 'search.performed',
  notificationRequested: 'notification.requested',
  notificationSent: 'notification.sent',
  notificationFailed: 'notification.failed',
  chatMembershipChanged: 'chat.membership.changed',
  chatMessageCreated: 'chat.message.created',
} as const;

export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EVENT_SNAPSHOT_TYPES = [
  EVENT_TYPES.eventCreated,
  EVENT_TYPES.eventUpdated,
  EVENT_TYPES.eventCancelled,
] as const;

export type EventSnapshotType = (typeof EVENT_SNAPSHOT_TYPES)[number];

export function isEventSnapshotType(type: string): type is EventSnapshotType {
  return (
    type === EVENT_TYPES.eventCreated ||
    type === EVENT_TYPES.eventUpdated ||
    type === EVENT_TYPES.eventCancelled
  );
}

export const MEMBERSHIP_EVENT_TYPES = [
  EVENT_TYPES.userJoined,
  EVENT_TYPES.userLeft,
] as const;
export type MembershipEventType = (typeof MEMBERSHIP_EVENT_TYPES)[number];

export function isMembershipEventType(
  type: string,
): type is MembershipEventType {
  return type === EVENT_TYPES.userJoined || type === EVENT_TYPES.userLeft;
}

export type RegistrationPolicyResultType =
  | typeof EVENT_TYPES.registrationPolicyApplied
  | typeof EVENT_TYPES.registrationPolicyRejected;
