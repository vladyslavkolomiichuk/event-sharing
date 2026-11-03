'use client';

import { useEffect } from 'react';
import { connectRealtime } from '@/lib/realtime/connectRealtime';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { needsUsernameSelection } from '@event-sharing/contracts';

export function NotificationsRealtimeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const { show } = useToast();

  useEffect(() => {
    if (!user || needsUsernameSelection(user.username)) return;
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
  }, [user?.id, user?.username, show]);

  return children;
}
