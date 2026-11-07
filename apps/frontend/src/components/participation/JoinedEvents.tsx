'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Membership } from '@event-sharing/contracts';
import { participationClient } from '@/lib/api/ParticipationClient';
import { eventsClient } from '@/lib/api/EventsClient';
import { Button } from '@/components/ui/button';
import { RowsSkeleton } from '@/components/feedback/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from '@/components/feedback/Notice';
import { EventUnreadBadge } from '@/components/messages/EventUnreadBadge';

export function JoinedEvents() {
  const [items, setItems] = useState<Membership[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const page = await participationClient.mine(next);
      setItems((previous) =>
        next ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
      const details = await Promise.all(
        page.items.map(async (membership) => ({
          id: membership.eventId,
          title: await eventsClient
            .get(membership.eventId)
            .then((event) => event.title)
            .catch(() => 'Event unavailable'),
        })),
      );
      setTitles((previous) => ({
        ...previous,
        ...Object.fromEntries(details.map(({ id, title }) => [id, title])),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load your events.',
      );
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);
  if (!loaded && busy)
    return <RowsSkeleton label="Loading joined events" action framed />;
  return (
    <div className="space-y-5">
      {items.length ? (
        <div className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white px-6">
          {items.map((item) => (
            <div
              key={item.eventId}
              className="flex flex-wrap items-center justify-between gap-3 py-5"
            >
              <div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/events/${item.eventId}`}
                    aria-label={titles[item.eventId] ? undefined : 'Open event'}
                    className="font-semibold hover:underline"
                  >
                    {titles[item.eventId] || <Skeleton className="h-5 w-48" />}
                  </Link>
                  <EventUnreadBadge eventId={item.eventId} />
                </div>
                <p className="mt-1 text-sm text-neutral-500">
                  Joined {new Date(item.joinedAt).toLocaleDateString('en-US')}
                </p>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href={`/events/${item.eventId}`}>View event</Link>
              </Button>
            </div>
          ))}
        </div>
      ) : loaded && !error ? (
        <p className="rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">
          You have not joined any events yet.
        </p>
      ) : null}
      {cursor && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more
        </Button>
      )}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
