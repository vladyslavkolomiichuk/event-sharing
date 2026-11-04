'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { participationClient } from '@/lib/api/ParticipationClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EventCard } from '@/components/events/EventCard';
import { Loading } from '@/components/feedback/Loading';

type ActivityCategory =
  'ALL' | 'UPCOMING' | 'JOINED' | 'ORGANIZED' | 'COMPLETED' | 'CANCELLED';

const categories: { value: ActivityCategory; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'UPCOMING', label: 'Upcoming' },
  { value: 'JOINED', label: 'Joined' },
  { value: 'ORGANIZED', label: 'Organized' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

type ActivityEvent = {
  event: EventDetail;
  organized: boolean;
  joined: boolean;
};

export function PersonalActivities() {
  const { user } = useAuth();
  const { show } = useToast();
  const [owned, setOwned] = useState<EventDetail[]>([]);
  const [joined, setJoined] = useState<EventDetail[]>([]);
  const [ownedCursor, setOwnedCursor] = useState<string | null>(null);
  const [joinedCursor, setJoinedCursor] = useState<string | null>(null);
  const [category, setCategory] = useState<ActivityCategory>('ALL');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'soonest' | 'latest'>('soonest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  async function load(append: boolean) {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [ownedPage, joinedPage] = await Promise.all([
        append && !ownedCursor
          ? Promise.resolve({ items: [], nextCursor: null })
          : eventsClient.mine(append ? (ownedCursor ?? undefined) : undefined),
        append && !joinedCursor
          ? Promise.resolve({ items: [], nextCursor: null })
          : participationClient.mine(
              append ? (joinedCursor ?? undefined) : undefined,
            ),
      ]);
      const activeMemberships = joinedPage.items.filter(
        (membership) => membership.status === 'JOINED',
      );
      const details = await Promise.allSettled(
        activeMemberships.map((membership) =>
          eventsClient.get(membership.eventId),
        ),
      );
      if (requestId.current !== current) return;
      const joinedEvents = details.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      setOwned((previous) =>
        append ? mergeEvents(previous, ownedPage.items) : ownedPage.items,
      );
      setJoined((previous) =>
        append ? mergeEvents(previous, joinedEvents) : joinedEvents,
      );
      setOwnedCursor(ownedPage.nextCursor);
      setJoinedCursor(joinedPage.nextCursor);
      if (details.some((result) => result.status === 'rejected'))
        show('Some joined events could not be opened.', 'warning');
    } catch (cause) {
      if (requestId.current !== current) return;
      const message =
        cause instanceof Error ? cause.message : 'Could not load activities.';
      setError(message);
      show(message, 'error');
    } finally {
      if (requestId.current === current) setLoading(false);
    }
  }

  useEffect(() => {
    void load(false);
    return () => {
      requestId.current++;
    };
  }, [user?.id]);

  const events = useMemo(() => {
    const combined = new Map<string, ActivityEvent>();
    for (const event of owned)
      combined.set(event.id, { event, organized: true, joined: false });
    for (const event of joined) {
      const existing = combined.get(event.id);
      combined.set(event.id, {
        event,
        organized: existing?.organized ?? false,
        joined: true,
      });
    }
    const search = query.trim().toLowerCase();
    const now = Date.now();
    return [...combined.values()]
      .filter(({ event, organized, joined }) => {
        if (
          category === 'UPCOMING' &&
          !(
            event.status === 'PUBLISHED' &&
            new Date(event.startTime).getTime() >= now
          )
        )
          return false;
        if (category === 'JOINED' && !joined) return false;
        if (category === 'ORGANIZED' && !organized) return false;
        if (category === 'COMPLETED' && event.status !== 'COMPLETED')
          return false;
        if (category === 'CANCELLED' && event.status !== 'CANCELLED')
          return false;
        return (
          !search ||
          [
            event.title,
            event.description,
            event.categoryName,
            event.location.region,
          ].some((value) => value?.toLowerCase().includes(search))
        );
      })
      .sort((a, b) => {
        const difference =
          new Date(a.event.startTime).getTime() -
          new Date(b.event.startTime).getTime();
        return sort === 'soonest' ? difference : -difference;
      });
  }, [owned, joined, category, query, sort]);

  return (
    <div className="grid gap-6 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        aria-label="Activity categories"
        className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
      >
        {categories
          .filter(
            (option) => option.value !== 'ORGANIZED' || user?.role !== 'USER',
          )
          .map((option) => (
            <button
              key={option.value}
              type="button"
              aria-current={category === option.value ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-left transition-colors hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-700 ${category === option.value ? 'bg-orange-50 font-semibold text-orange-800' : 'text-neutral-600'}`}
              onClick={() => setCategory(option.value)}
            >
              {option.label}
            </button>
          ))}
      </nav>
      <section aria-label="Your event activities" className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-neutral-200 bg-white p-4">
          <div className="min-w-[min(100%,16rem)] flex-1">
            <label htmlFor="activity-search">Search loaded events</label>
            <Input
              id="activity-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Title, category, or city"
            />
          </div>
          <div>
            <label htmlFor="activity-sort">Sort by</label>
            <select
              id="activity-sort"
              value={sort}
              onChange={(event) =>
                setSort(event.target.value as 'soonest' | 'latest')
              }
            >
              <option value="soonest">Soonest</option>
              <option value="latest">Latest</option>
            </select>
          </div>
        </div>
        <p className="text-sm text-neutral-600">
          {events.length} loaded events shown
        </p>
        {loading && !owned.length && !joined.length ? (
          <Loading label="Loading your activities…" />
        ) : events.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map(({ event, organized, joined }) => (
              <EventCard
                key={event.id}
                event={event}
                relationship={
                  organized && joined
                    ? 'Organizing and joined'
                    : organized
                      ? 'Organizing'
                      : 'Joined'
                }
              />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-neutral-200 bg-white p-6 text-sm text-neutral-600">
            {error ||
              (ownedCursor || joinedCursor
                ? 'No loaded events match. Load more to continue searching.'
                : 'No events match this view.')}
          </p>
        )}
        {(ownedCursor || joinedCursor) && (
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load(true)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        )}
        {error && (
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void load(false)}
          >
            Retry
          </Button>
        )}
      </section>
    </div>
  );
}

function mergeEvents(
  previous: EventDetail[],
  next: EventDetail[],
): EventDetail[] {
  const events = new Map(previous.map((event) => [event.id, event]));
  for (const event of next) events.set(event.id, event);
  return [...events.values()];
}
