'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { InAppMessage, InAppNotification } from '@event-sharing/contracts';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { useToast } from '@/contexts/ToastContext';
import { NotificationItem } from './NotificationItem';

export function NotificationsWorkspace({ messageId }: { messageId?: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState<InAppMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const firstPageRequest = useRef(0);

  useEffect(() => {
    const currentRequest = ++firstPageRequest.current;
    notificationsClient
      .list()
      .then((page) => {
        if (firstPageRequest.current !== currentRequest) return;
        setItems(page.items);
        setCursor(page.nextCursor);
        setUnread(page.unreadCount);
      })
      .catch((cause) => {
        if (firstPageRequest.current !== currentRequest) return;
        show(
          cause instanceof Error
            ? cause.message
            : 'Could not load notifications.',
          'error',
        );
      })
      .finally(() => {
        if (firstPageRequest.current === currentRequest) setLoading(false);
      });
    return () => {
      firstPageRequest.current++;
    };
  }, [show]);
  useEffect(() => {
    const refresh = () => {
      const currentRequest = ++firstPageRequest.current;
      void notificationsClient
        .list()
        .then((page) => {
          if (firstPageRequest.current !== currentRequest) return;
          setItems(page.items);
          setUnread(page.unreadCount);
          setCursor(page.nextCursor);
        })
        .catch(() => {
          if (firstPageRequest.current === currentRequest)
            show('Could not refresh notifications.', 'error');
        })
        .finally(() => {
          if (firstPageRequest.current === currentRequest) setLoading(false);
        });
    };
    window.addEventListener('notifications:remote', refresh);
    return () => {
      firstPageRequest.current++;
      window.removeEventListener('notifications:remote', refresh);
    };
  }, [show]);
  useEffect(() => {
    if (messageId)
      notificationsClient
        .getMessage(messageId)
        .then(setMessage)
        .catch(() => show('Could not open the announcement.', 'error'));
  }, [messageId, show]);

  async function open(item: InAppNotification) {
    try {
      if (!item.readAt) {
        const updated = await notificationsClient.markRead(item.id);
        setItems((current) =>
          current.map((entry) => (entry.id === item.id ? updated : entry)),
        );
        setUnread((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event('notifications:changed'));
      }
      if (item.messageId) {
        setMessage(await notificationsClient.getMessage(item.messageId));
        router.push(`/notifications?message=${item.messageId}`);
      } else router.push(item.href);
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not open notification.',
        'error',
      );
    }
  }

  async function markAll() {
    setBusy(true);
    try {
      await notificationsClient.markAllRead();
      setItems((current) =>
        current.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      );
      setUnread(0);
      show('All notifications marked as read.', 'success');
      window.dispatchEvent(new Event('notifications:changed'));
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not update notifications.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function loadMore() {
    if (!cursor) return;
    setBusy(true);
    try {
      const page = await notificationsClient.list(cursor);
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
      setUnread(page.unreadCount);
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not load more notifications.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: InAppNotification) {
    setBusy(true);
    try {
      await notificationsClient.remove(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (!item.readAt) setUnread((count) => Math.max(0, count - 1));
      window.dispatchEvent(new Event('notifications:changed'));
      show('Notification deleted.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not delete notification.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1>Notifications</h1>
          <p className="text-neutral-600">{unread} unread</p>
        </div>
        <Button
          variant="outline"
          disabled={busy || unread === 0}
          onClick={() => void markAll()}
        >
          Mark all as read
        </Button>
      </div>
      {message && (
        <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-6">
          <h2>Organizer announcement</h2>
          <p className="whitespace-pre-wrap">{message.body}</p>
          {message.eventId && (
            <Link
              href={`/events/${message.eventId}`}
              className="text-sm font-semibold underline"
            >
              Open event
            </Link>
          )}
        </section>
      )}
      {loading ? (
        <Loading label="Loading notifications…" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-6 text-neutral-600">
          No notifications yet.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <NotificationItem
              key={item.id}
              item={item}
              busy={busy}
              onOpen={(entry) => void open(entry)}
              onRemove={(entry) => void remove(entry)}
            />
          ))}
          {cursor && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void loadMore()}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
