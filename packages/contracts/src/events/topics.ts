export const EVENT_TOPICS = {
  identity: 'event-sharing.identity.v1',
  users: 'event-sharing.users.v1',
  events: 'event-sharing.events.v1',
  participation: 'event-sharing.participation.v1',
  search: 'event-sharing.search.v1',
  notifications: 'event-sharing.notifications.v1',
  messages: 'event-sharing.messages.v1',
} as const;

export type EventTopic = (typeof EVENT_TOPICS)[keyof typeof EVENT_TOPICS];
