'use client';

import { TextSkeleton } from '@/components/feedback/Skeletons';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SystemMessage } from '@event-sharing/contracts';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format-date';

export function SystemMessages() {
  const { show } = useToast();
  const [items, setItems] = useState<SystemMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const current = ++requestId.current;
      if (next) setLoading(true);
      setFailed(false);
      try {
        const page = await notificationsClient.systemMessages(next);
        if (current !== requestId.current) return;
        setItems((previous) =>
          next ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } catch (cause) {
        if (current === requestId.current) {
          setFailed(true);
          show(
            cause instanceof Error
              ? cause.message
              : 'Could not load system messages.',
            'error',
          );
        }
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [show],
  );
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('notifications:remote', refresh);
    return () => {
      requestId.current++;
      window.removeEventListener('notifications:remote', refresh);
    };
  }, [load]);
  return (
    <section
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
      aria-label="System messages"
    >
      <div>
        <h2>System messages</h2>
        <p className="text-sm text-neutral-600">
          Updates from the platform team.
        </p>
      </div>
      {items.map((item) => (
        <article
          key={item.id}
          className="space-y-2 border-t border-neutral-200 pt-3"
        >
          <h3>{item.title}</h3>
          <p className="whitespace-pre-wrap text-sm text-neutral-700">
            {item.body}
          </p>
          <p className="text-xs text-neutral-500">
            {formatDateTime(item.createdAt)}
          </p>
        </article>
      ))}
      {!items.length && loading && (
        <TextSkeleton label="Loading system messages" lines={1} />
      )}
      {!items.length && !loading && (
        <p className="text-sm text-neutral-600">
          {failed ? 'System messages are unavailable.' : 'No system messages.'}
        </p>
      )}
      {failed && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void load()}
        >
          Retry
        </Button>
      )}
      {cursor && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
