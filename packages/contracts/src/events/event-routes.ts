import { EVENT_TYPES, type EventType } from './event-types.js';
import { EVENT_TOPICS, type EventTopic } from './topics.js';
import type { EventProducer } from './event-envelope.schema.js';

export const EVENT_ROUTES = {
  [EVENT_TYPES.userRegistered]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.userRoleChanged]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.userNameUpdated]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.userUsernameUpdated]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.organizerRequestSubmitted]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.organizerRequestResolved]: {
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
  },
  [EVENT_TYPES.userProfileUpdated]: {
    producer: 'users',
    topic: EVENT_TOPICS.users,
  },
  [EVENT_TYPES.friendRequested]: {
    producer: 'users',
    topic: EVENT_TOPICS.users,
  },
  [EVENT_TYPES.friendAccepted]: {
    producer: 'users',
    topic: EVENT_TOPICS.users,
  },
  [EVENT_TYPES.invitationSent]: {
    producer: 'participation',
    topic: EVENT_TOPICS.participation,
  },
  [EVENT_TYPES.eventCreated]: {
    producer: 'events',
    topic: EVENT_TOPICS.events,
  },
  [EVENT_TYPES.eventUpdated]: {
    producer: 'events',
    topic: EVENT_TOPICS.events,
  },
  [EVENT_TYPES.eventCancelled]: {
    producer: 'events',
    topic: EVENT_TOPICS.events,
  },
  [EVENT_TYPES.registrationPolicyRequested]: {
    producer: 'events',
    topic: EVENT_TOPICS.events,
  },
  [EVENT_TYPES.registrationPolicyApplied]: {
    producer: 'participation',
    topic: EVENT_TOPICS.participation,
  },
  [EVENT_TYPES.registrationPolicyRejected]: {
    producer: 'participation',
    topic: EVENT_TOPICS.participation,
  },
  [EVENT_TYPES.userJoined]: {
    producer: 'participation',
    topic: EVENT_TOPICS.participation,
  },
  [EVENT_TYPES.userLeft]: {
    producer: 'participation',
    topic: EVENT_TOPICS.participation,
  },
  [EVENT_TYPES.searchPerformed]: {
    producer: 'geo-search',
    topic: EVENT_TOPICS.search,
  },
  [EVENT_TYPES.notificationRequested]: {
    producer: 'auth',
    topic: EVENT_TOPICS.notifications,
  },
  [EVENT_TYPES.notificationSent]: {
    producer: 'notifications',
    topic: EVENT_TOPICS.notifications,
  },
  [EVENT_TYPES.notificationFailed]: {
    producer: 'notifications',
    topic: EVENT_TOPICS.notifications,
  },
  [EVENT_TYPES.chatMembershipChanged]: {
    producer: 'messages',
    topic: EVENT_TOPICS.messages,
  },
  [EVENT_TYPES.chatMessageCreated]: {
    producer: 'messages',
    topic: EVENT_TOPICS.messages,
  },
} as const satisfies Record<
  EventType,
  { producer: EventProducer; topic: EventTopic }
>;
