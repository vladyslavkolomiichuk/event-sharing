'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { notificationsClient } from '@/lib/api/NotificationsClient';

export function NotificationStatus() {
  const { user, refresh: refreshAuth } = useAuth();
  const { show } = useToast();
  const [unread, setUnread] = useState(0);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);
  const failed = useRef(false);
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    if (!user) return;
    const currentRequest = ++requestId.current;
    try {
      const page = await notificationsClient.list();
      if (requestId.current !== currentRequest) return;
      if (initialized.current) {
        const incoming = page.items
          .filter((item) => !item.readAt && !seen.current.has(item.id))
          .reverse()
          .slice(-4);
        for (const item of incoming) {
          show(`${item.title}: ${item.body}`, 'info', item.href);
          if (item.type === 'ORGANIZER_REQUEST_DECISION') void refreshAuth();
        }
      }
      seen.current = new Set(
        [...page.items.map((item) => item.id), ...seen.current].slice(0, 100),
      );
      initialized.current = true;
      failed.current = false;
      setUnread(page.unreadCount);
    } catch {
      if (requestId.current !== currentRequest) return;
      if (!failed.current) show('Could not load notifications.', 'error');
      failed.current = true;
    }
  }, [user?.id, show, refreshAuth]);

  useEffect(() => {
    seen.current.clear();
    initialized.current = false;
    failed.current = false;
    setUnread(0);
    if (!user) return;
    void refresh();
    const changed = () => void refresh();
    window.addEventListener('notifications:changed', changed);
    window.addEventListener('notifications:remote', changed);
    return () => {
      requestId.current++;
      window.removeEventListener('notifications:changed', changed);
      window.removeEventListener('notifications:remote', changed);
    };
  }, [user?.id, refresh]);

  return (
    <Link href="/notifications" className="hover:text-black">
      Notifications
      {user && unread > 0 && (
        <span className="ml-1 rounded-full bg-black px-2 py-0.5 text-xs text-white">
          {unread}
        </span>
      )}
    </Link>
  );
}
