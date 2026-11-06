import { z } from 'zod';

export const NOTIFICATION_TYPES = [
  'EVENT_MODERATION',
  'EVENT_APPROVED',
  'EVENT_REJECTED',
  'EVENT_UPDATED',
  'EVENT_CANCELLED',
  'EVENT_COMPLETED',
  'EVENT_ORGANIZER_DELETED',
  'PARTICIPANT_JOINED',
  'DIRECT_MESSAGE',
  'EVENT_MESSAGE',
  'FRIEND_REQUEST',
  'FRIEND_ACCEPTED',
  'EVENT_INVITATION',
  'CHAT_GROUP_CHANGED',
  'ORGANIZER_REQUEST',
  'ORGANIZER_REQUEST_DECISION',
] as const;

export const NotificationFilterSchema = z.enum([
  'ALL',
  'UNREAD',
  'EVENTS',
  'SOCIAL',
  'ACCOUNT',
]);

export const NOTIFICATION_GROUP_TYPES = {
  EVENTS: [
    'EVENT_MODERATION',
    'EVENT_APPROVED',
    'EVENT_REJECTED',
    'EVENT_UPDATED',
    'EVENT_CANCELLED',
    'EVENT_COMPLETED',
    'EVENT_ORGANIZER_DELETED',
    'PARTICIPANT_JOINED',
    'EVENT_MESSAGE',
    'EVENT_INVITATION',
  ],
  SOCIAL: [
    'DIRECT_MESSAGE',
    'FRIEND_REQUEST',
    'FRIEND_ACCEPTED',
    'CHAT_GROUP_CHANGED',
  ],
  ACCOUNT: ['ORGANIZER_REQUEST', 'ORGANIZER_REQUEST_DECISION'],
} as const satisfies Record<
  string,
  readonly (typeof NOTIFICATION_TYPES)[number][]
>;

export const InAppNotificationSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string(),
  href: z.string().startsWith('/'),
  senderId: z.uuid().nullable(),
  eventId: z.uuid().nullable(),
  messageId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});

export const InAppNotificationListSchema = z.strictObject({
  items: z.array(InAppNotificationSchema),
  unreadCount: z.number().int().nonnegative(),
  nextCursor: z.uuid().nullable(),
});

export type InAppNotification = z.infer<typeof InAppNotificationSchema>;
export type InAppNotificationList = z.infer<typeof InAppNotificationListSchema>;
export type NotificationFilter = z.infer<typeof NotificationFilterSchema>;
