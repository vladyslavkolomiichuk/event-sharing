'use client';

import { useEffect } from 'react';
import { connectRealtime } from '@/lib/realtime/connectRealtime';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

export function NotificationsRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { show } = useToast();

  useEffect(() => {
    if (!user) return;
    return connectRealtime({
      path: '/realtime/notifications',
      signalType: 'notifications.changed',
      onConnected: () =>
        window.dispatchEvent(new Event('notifications:remote')),
      onSignal: () => window.dispatchEvent(new Event('notifications:remote')),
      onDisconnected: () =>
        show('Live notifications are disconnected. Reconnecting…', 'warning'),
      onRestored: () => show('Live notifications restored.', 'success'),
    });
  }, [user?.id, show]);

  return children;
}
