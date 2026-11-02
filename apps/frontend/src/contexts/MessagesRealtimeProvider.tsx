'use client';

import { useEffect } from 'react';
import { connectRealtime } from '@/lib/realtime/connectRealtime';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export function MessagesRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { show } = useToast();

  useEffect(() => {
    if (!user) return;
    return connectRealtime({
      path: '/realtime/messages',
      signalType: 'messages.changed',
      onConnected: () => window.dispatchEvent(new Event('messages:remote')),
      onSignal: (signal) => {
        if (typeof signal.eventId !== 'string') return;
        window.dispatchEvent(
          new CustomEvent('messages:remote', {
            detail: {
              eventId: signal.eventId,
              roomId:
                typeof signal.roomId === 'string' ? signal.roomId : undefined,
            },
          }),
        );
      },
      onDisconnected: () =>
        show('Live chats are disconnected. Reconnecting…', 'warning'),
      onRestored: () => show('Live chats restored.', 'success'),
    });
  }, [user?.id, show]);

  return children;
}
