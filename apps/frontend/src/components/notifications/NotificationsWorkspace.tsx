'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { InAppMessage, InAppNotification } from '@event-sharing/contracts';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';
import { Loading } from '@/components/feedback/Loading';

export function NotificationsWorkspace({ messageId }: { messageId?: string }) {
  const router = useRouter();
  const [items, setItems] = useState<InAppNotification[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [message, setMessage] = useState<InAppMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
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
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load notifications.',
        );
      })
      .finally(() => {
        if (firstPageRequest.current === currentRequest) setLoading(false);
      });
    return () => {
      firstPageRequest.current++;
    };
  }, []);
  useEffect(() => {
    const refresh = () => {
      const currentRequest = ++firstPageRequest.current;
      void notificationsClient
        .list()
        .then((page) => {
          if (firstPageRequest.current !== currentRequest) return;
          setItems((current) => {
            const merged = new Map(current.map((item) => [item.id, item]));
            for (const item of page.items) merged.set(item.id, item);
            return [...merged.values()]
              .map((item) =>
                page.unreadCount === 0 && !item.readAt
                  ? { ...item, readAt: new Date().toISOString() }
                  : item,
              )
              .sort(
                (left, right) =>
                  right.createdAt.localeCompare(left.createdAt) ||
                  right.id.localeCompare(left.id),
              );
          });
          setUnread(page.unreadCount);
          setCursor((current) => current ?? page.nextCursor);
          setError('');
        })
        .catch(() => {
          if (firstPageRequest.current === currentRequest)
            setError('Could not refresh notifications.');
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
  }, []);
  useEffect(() => {
    if (messageId)
      notificationsClient
        .getMessage(messageId)
        .then(setMessage)
        .catch(() => setError('Could not open the announcement.'));
  }, [messageId]);

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
      setError(
        cause instanceof Error ? cause.message : 'Could not open notification.',
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
      setNotice('All notifications marked as read.');
      window.dispatchEvent(new Event('notifications:changed'));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update notifications.',
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
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load more notifications.',
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
            <div
              key={item.id}
              className={`rounded-xl border p-5 ${item.readAt ? 'border-neutral-200 bg-white' : 'border-neutral-900 bg-neutral-50'}`}
            >
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-neutral-700">{item.body}</p>
              <p className="mt-2 text-xs text-neutral-500">
                {new Date(item.createdAt).toLocaleString('en-US')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void open(item)}
              >
                {item.messageId ? 'Read announcement' : 'Open event'}
              </Button>
            </div>
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
      {notice && <Notice message={notice} tone="success" />}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
