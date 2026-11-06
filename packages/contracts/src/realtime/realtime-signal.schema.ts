import { z } from 'zod';

export const REALTIME_SIGNAL_TYPES = {
  notificationsChanged: 'notifications.changed',
  messagesChanged: 'messages.changed',
} as const;

export const ChatRealtimeMessageSchema = z.strictObject({
  id: z.uuid(),
  roomName: z.string().min(1).max(80),
  senderId: z.uuid(),
  senderName: z.string().min(1),
  body: z.string().min(1).max(2000),
});

export const RealtimeSignalSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(REALTIME_SIGNAL_TYPES.notificationsChanged),
  }),
  z.strictObject({
    type: z.literal(REALTIME_SIGNAL_TYPES.messagesChanged),
    eventId: z.uuid(),
    roomId: z.uuid().optional(),
    message: ChatRealtimeMessageSchema.optional(),
  }),
]);

export type ChatRealtimeMessage = z.infer<typeof ChatRealtimeMessageSchema>;
export type RealtimeSignal = z.infer<typeof RealtimeSignalSchema>;
