'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  InAppMessage,
  InAppNotification,
  NotificationFilter,
} from '@event-sharing/contracts';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { useToast } from '@/contexts/ToastContext';
import { NotificationItem } from './NotificationItem';
import { SystemMessages } from './SystemMessages';
import { notificationLink } from './notificationLink';

const filters: { value: NotificationFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UNREAD', label: 'Unread' },
  { value: 'EVENTS', label: 'Events' },
  { value: 'SOCIAL', label: 'Social' },
  { value: 'ACCOUNT', label: 'Account' },
];

export function NotificationsWorkspace({ messageId }: { messageId?: string }) {
  const router = useRouter();
  const { show } = useToast();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [message, setMessage] = useState<InAppMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstPageRequest = useRef(0);

  const loadFirst = useCallback(async () => {
    const currentRequest = ++firstPageRequest.current;
    setLoading(true);
    setFailed(false);
    setItems([]);
    setCursor(null);
    try {
      const page = await notificationsClient.list(undefined, filter);
      if (firstPageRequest.current !== currentRequest) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setUnread(page.unreadCount);
    } catch (cause) {
      if (firstPageRequest.current !== currentRequest) return;
      setFailed(true);
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not load notifications.',
        'error',
      );
    } finally {
      if (firstPageRequest.current === currentRequest) setLoading(false);
    }
  }, [filter, show]);

  useEffect(() => {
    void loadFirst();
    const refresh = () => void loadFirst();
    window.addEventListener('notifications:remote', refresh);
    return () => {
      firstPageRequest.current++;
      window.removeEventListener('notifications:remote', refresh);
    };
  }, [loadFirst]);
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
          filter === 'UNREAD'
            ? current.filter((entry) => entry.id !== item.id)
            : current.map((entry) => (entry.id === item.id ? updated : entry)),
        );
        setUnread((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event('notifications:changed'));
      }
      if (item.messageId) {
        setMessage(await notificationsClient.getMessage(item.messageId));
        router.push(`/notifications?message=${item.messageId}`);
      } else router.push(notificationLink(item.href, item.type));
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
        filter === 'UNREAD'
          ? []
          : current.map((item) => ({
              ...item,
              readAt: item.readAt ?? new Date().toISOString(),
            })),
      );
      if (filter === 'UNREAD') setCursor(null);
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
    const currentRequest = firstPageRequest.current;
    setBusy(true);
    try {
      const page = await notificationsClient.list(cursor, filter);
      if (currentRequest !== firstPageRequest.current) return;
      setItems((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setCursor(page.nextCursor);
      setUnread(page.unreadCount);
    } catch (cause) {
      if (currentRequest !== firstPageRequest.current) return;
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
        cause instanceof Error
          ? cause.message
          : 'Could not delete notification.',
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
      <SystemMessages />
      <div
        role="group"
        aria-label="Filter notifications"
        className="flex flex-wrap gap-2"
      >
        {filters.map((option) => (
          <Button
            key={option.value}
            type="button"
            size="sm"
            variant={filter === option.value ? 'default' : 'outline'}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </Button>
        ))}
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
          {failed
            ? 'Notifications are unavailable. Try again.'
            : filter === 'ALL'
              ? 'No notifications yet.'
              : 'No notifications in this view.'}
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
      {failed && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void loadFirst()}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
