import { z } from 'zod';

export const REALTIME_SIGNAL_TYPES = {
  notificationsChanged: 'notifications.changed',
  messagesChanged: 'messages.changed',
} as const;

export const RealtimeSignalSchema = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal(REALTIME_SIGNAL_TYPES.notificationsChanged),
  }),
  z.strictObject({
    type: z.literal(REALTIME_SIGNAL_TYPES.messagesChanged),
    eventId: z.uuid(),
    roomId: z.uuid().optional(),
  }),
]);

export type RealtimeSignal = z.infer<typeof RealtimeSignalSchema>;
