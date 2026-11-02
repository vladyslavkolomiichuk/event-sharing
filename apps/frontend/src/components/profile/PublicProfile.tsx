'use client';

import { useEffect, useState } from 'react';
import type { EventDetail, UserProfilePublic } from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { eventsClient } from '@/lib/api/EventsClient';
import { EventCard } from '@/components/events/EventCard';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { Notice } from '@/components/feedback/Notice';
import { ProfileAvatar } from './ProfileAvatar';

export function PublicProfile({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<UserProfilePublic | null>(null);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [eventsError, setEventsError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let active = true;
    setProfile(null);
    setEvents([]);
    setCursor(null);
    setError('');
    setEventsError('');
    setEventsLoading(true);
    usersClient
      .get(userId)
      .then((person) => {
        if (!active) return;
        setProfile(person);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : 'Could not load profile.',
          );
        }
      });
    eventsClient
      .byOrganizer(userId)
      .then((page) => {
        if (!active) return;
        setEvents(page.items);
        setCursor(page.nextCursor);
        setEventsLoading(false);
      })
      .catch((cause) => {
        if (active) {
          setEventsLoading(false);
          setEventsError(
            cause instanceof Error ? cause.message : 'Could not load events.',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    setEventsError('');
    try {
      const page = await eventsClient.byOrganizer(userId, cursor);
      setEvents((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setEventsError(
        cause instanceof Error ? cause.message : 'Could not load events.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  if (error)
    return (
      <div className="space-y-4">
        <Notice message={error} tone="error" />
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  if (!profile) return <Loading label="Loading profile…" />;
  return (
    <div className="space-y-8">
      <section className="space-y-7 rounded-xl border border-neutral-200 bg-white p-8">
        <div className="flex flex-wrap items-center gap-5">
          <ProfileAvatar
            name={profile.name}
            avatarUrl={profile.avatarUrl}
            size="lg"
          />
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Public profile
            </p>
            <h1>{profile.name}</h1>
            <p className="mt-2 text-sm text-neutral-500">
              Member since{' '}
              {new Date(profile.createdAt).toLocaleDateString('en-US', {
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>
        <div>
          <h2 className="mb-3">About</h2>
          <p className="whitespace-pre-wrap leading-7 text-neutral-700">
            {profile.bio || 'No biography shared yet.'}
          </p>
        </div>
        <dl className="grid gap-5 border-t border-neutral-200 pt-6 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-semibold">City</dt>
            <dd className="mt-1 text-neutral-600">
              {profile.city || 'Not shared'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold">Phone</dt>
            <dd className="mt-1 text-neutral-600">
              {profile.phone ? (
                <a href={`tel:${profile.phone}`} className="underline">
                  {profile.phone}
                </a>
              ) : (
                'Not shared'
              )}
            </dd>
          </div>
        </dl>
      </section>
      <section className="space-y-5">
        <h2>Organized events</h2>
        {eventsLoading ? (
          <Loading label="Loading events…" />
        ) : events.length ? (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        ) : !eventsError ? (
          <p className="rounded-xl border border-neutral-200 bg-white p-7 text-neutral-600">
            No public events yet.
          </p>
        ) : null}
        {cursor && (
          <Button variant="outline" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
        {eventsError && <Notice message={eventsError} tone="error" />}
      </section>
    </div>
  );
}
