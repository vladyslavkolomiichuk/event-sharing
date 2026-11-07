'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { useAuth } from '@/contexts/AuthContext';
import { EventCard } from './EventCard';
import { Button } from '@/components/ui/button';
import { EventCardsSkeleton } from '@/components/feedback/Skeletons';
import { Notice } from '@/components/feedback/Notice';

export function EventList({
  mine = false,
  compact = false,
}: {
  mine?: boolean;
  compact?: boolean;
}) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<EventDetail[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(next?: string) {
    setLoading(true);
    setError('');
    try {
      const page = mine
        ? await eventsClient.mine(next)
        : await eventsClient.list(next);
      setItems((previous) =>
        next ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load events.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && user) void load();
  }, [authLoading, user, mine]);
  const skeleton = (
    <EventCardsSkeleton
      count={compact ? 3 : 6}
      className={compact ? 'md:grid-cols-3' : undefined}
    />
  );
  if (authLoading) return skeleton;
  if (!user)
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8">
        <p className="mb-5 text-neutral-600">
          Sign in to browse events and manage your registrations.
        </p>
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );

  return (
    <div className="space-y-6">
      {error && <Notice message={error} tone="error" />}
      {loading && items.length === 0 ? (
        skeleton
      ) : items.length === 0 && !error ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">
          {mine
            ? 'You have not created any events yet.'
            : 'No events are available yet.'}
        </div>
      ) : (
        <div
          className={`grid gap-5 ${compact ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3'}`}
        >
          {items.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
      {cursor && (
        <Button
          variant="outline"
          onClick={() => void load(cursor)}
          loading={loading}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
