import { z } from 'zod';

export const ChatRoomSchema = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  createdAt: z.iso.datetime(),
  archivedAt: z.iso.datetime().nullable(),
  unreadCount: z.number().int().nonnegative(),
  lastMessage: z
    .strictObject({
      body: z.string(),
      senderName: z.string(),
      createdAt: z.iso.datetime(),
    })
    .nullable(),
});
export const ChatMessageSchema = z.strictObject({
  id: z.uuid(),
  roomId: z.uuid(),
  eventId: z.uuid(),
  senderId: z.uuid(),
  senderName: z.string(),
  body: z.string(),
  createdAt: z.iso.datetime(),
});
export const CreateChatRoomSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
});
export const SendChatMessageSchema = z.strictObject({
  body: z.string().trim().min(1).max(2000),
});
export const MarkChatReadSchema = z.strictObject({
  messageId: z.uuid(),
});
export const ChatOverviewSchema = z.strictObject({
  totalUnread: z.number().int().nonnegative(),
  events: z.array(
    z.strictObject({
      eventId: z.uuid(),
      title: z.string(),
      unreadCount: z.number().int().nonnegative(),
      lastMessageAt: z.iso.datetime().nullable(),
    }),
  ),
});
export type ChatRoom = z.infer<typeof ChatRoomSchema>;
export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ChatOverview = z.infer<typeof ChatOverviewSchema>;
