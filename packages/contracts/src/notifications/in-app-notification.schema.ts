import { z } from 'zod';

export const InAppNotificationSchema = z.strictObject({
  id: z.uuid(),
  type: z.enum([
    'EVENT_MODERATION',
    'EVENT_APPROVED',
    'EVENT_REJECTED',
    'EVENT_CANCELLED',
    'EVENT_COMPLETED',
    'PARTICIPANT_JOINED',
    'DIRECT_MESSAGE',
    'EVENT_MESSAGE',
    'FRIEND_REQUEST',
    'FRIEND_ACCEPTED',
  ]),
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
