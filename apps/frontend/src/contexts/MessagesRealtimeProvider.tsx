'use client';

import { useEffect } from 'react';
import { connectRealtime } from '@/lib/realtime/connectRealtime';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import {
  needsUsernameSelection,
  RealtimeSignalSchema,
} from '@event-sharing/contracts';

export function MessagesRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { show } = useToast();

  useEffect(() => {
    if (!user || needsUsernameSelection(user.username)) return;
    return connectRealtime({
      path: '/realtime/messages',
      signalType: 'messages.changed',
      onConnected: () => window.dispatchEvent(new Event('messages:remote')),
      onSignal: (signal) => {
        const parsed = RealtimeSignalSchema.safeParse(signal);
        if (!parsed.success || parsed.data.type !== 'messages.changed') return;
        const { eventId, roomId, message } = parsed.data;
        window.dispatchEvent(
          new CustomEvent('messages:remote', {
            detail: { eventId, roomId },
          }),
        );
        if (message && roomId) {
          show(
            `${message.roomName}\n${message.senderName}: ${message.body}`,
            'info',
            `/events/${eventId}?view=chats&room=${roomId}`,
          );
        }
      },
      onDisconnected: () =>
        show('Live chats are disconnected. Reconnecting…', 'warning'),
      onRestored: () => show('Live chats restored.', 'success'),
    });
  }, [user?.id, user?.username, show]);

  return children;
}
