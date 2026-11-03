import { z } from 'zod';

export const ChatRoomAccessSchema = z.enum([
  'ALL_PARTICIPANTS',
  'SELECTED_MEMBERS',
]);

export const ChatRoomSchema = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid(),
  name: z.string(),
  access: ChatRoomAccessSchema,
  memberCount: z.number().int().nonnegative(),
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
  clientMessageId: z.uuid(),
  createdAt: z.iso.datetime(),
});
export const CreateChatRoomSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  access: ChatRoomAccessSchema.default('SELECTED_MEMBERS'),
  memberIds: z.array(z.uuid()).max(50).default([]),
});
export const UpdateChatRoomSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  access: ChatRoomAccessSchema.optional(),
});
export const AddChatRoomMembersSchema = z.strictObject({
  userIds: z.array(z.uuid()).min(1).max(50),
});
export const ChatRoomMemberSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string(),
  status: z.enum(['PENDING', 'ACTIVE', 'REMOVED']),
});
export const SendChatMessageSchema = z.strictObject({
  body: z.string().trim().min(1).max(2000),
  clientMessageId: z.uuid(),
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
export type ChatRoomMember = z.infer<typeof ChatRoomMemberSchema>;
export type ChatRoomAccess = z.infer<typeof ChatRoomAccessSchema>;
export type CreateChatRoom = z.infer<typeof CreateChatRoomSchema>;
export type UpdateChatRoom = z.infer<typeof UpdateChatRoomSchema>;
