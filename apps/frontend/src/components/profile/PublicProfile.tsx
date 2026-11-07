'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  EventDetail,
  ParticipationHistory,
  UserProfilePublic,
} from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { friendsClient } from '@/lib/api/FriendsClient';
import { useAuth } from '@/contexts/AuthContext';
import { eventsClient } from '@/lib/api/EventsClient';
import { participationClient } from '@/lib/api/ParticipationClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { useToast } from '@/contexts/ToastContext';
import { EventCard } from '@/components/events/EventCard';
import { Button } from '@/components/ui/button';
import {
  EventCardsSkeleton,
  ProfileSkeleton,
} from '@/components/feedback/Skeletons';
import { Notice } from '@/components/feedback/Notice';
import { ProfileAvatar } from './ProfileAvatar';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { formatDate } from '@/lib/format-date';

export function PublicProfile({ userId }: { userId: string }) {
  const { user } = useAuth();
  const { show } = useToast();
  const [profile, setProfile] = useState<UserProfilePublic | null>(null);
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [eventsError, setEventsError] = useState('');
  const [eventsLoading, setEventsLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [friendMessage, setFriendMessage] = useState('');
  const [history, setHistory] = useState<ParticipationHistory['items']>([]);
  const [historyNextPage, setHistoryNextPage] = useState<number | null>(null);

  async function addFriend() {
    if (!profile) return;
    try {
      await friendsClient.request(profile.username);
      setFriendMessage('Friend request sent.');
    } catch (cause) {
      setFriendMessage(
        cause instanceof Error ? cause.message : 'Could not send request.',
      );
    }
  }

  useEffect(() => {
    let active = true;
    setProfile(null);
    setEvents([]);
    setCursor(null);
    setError('');
    setEventsError('');
    setEventsLoading(true);
    setHistory([]);
    setHistoryNextPage(null);
    usersClient
      .get(userId)
      .then((person) => {
        if (!active) return;
        setProfile(person);
        void participationClient.history(userId).then(
          (result) => {
            if (!active) return;
            setHistory(result.items);
            setHistoryNextPage(result.nextPage);
          },
          (cause) => {
            if (!active) return;
            if (cause instanceof ApiError && cause.status === 403) return;
            show('Could not load participation history.', 'error');
          },
        );
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

  async function loadMoreHistory() {
    if (historyNextPage === null) return;
    try {
      const result = await participationClient.history(userId, historyNextPage);
      setHistory((current) => [...current, ...result.items]);
      setHistoryNextPage(result.nextPage);
    } catch {
      show('Could not load more participation history.', 'error');
    }
  }

  async function hideHistory(eventId: string) {
    try {
      await participationClient.hideHistory(eventId);
      setHistory((items) => items.filter((item) => item.eventId !== eventId));
      show(
        'Removed from your history. Other participants keep their history.',
        'success',
      );
    } catch (error) {
      show(
        error instanceof Error ? error.message : 'Could not hide this event.',
        'error',
      );
    }
  }

  if (error)
    return (
      <div className="space-y-4">
        <InlineFeedback message={error} tone="error" />
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  if (!profile) return <ProfileSkeleton />;
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
            <p className="text-sm font-medium text-neutral-500">
              Public profile
            </p>
            <h1>{profile.name}</h1>
            <p className="text-neutral-500">@{profile.username}</p>
            {user && user.id !== profile.userId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => void addFriend()}
              >
                Add friend
              </Button>
            )}
            {friendMessage && (
              <Notice
                message={friendMessage}
                tone={
                  friendMessage === 'Friend request sent.' ? 'success' : 'error'
                }
              />
            )}
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
      {(history.length > 0 || historyNextPage !== null) && (
        <section className="space-y-5">
          <h2>Participation history</h2>
          <ul className="divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white px-6">
            {history.map((item) => (
              <li
                key={item.eventId}
                className="flex flex-wrap justify-between gap-3 py-4"
              >
                <Link
                  href={`/events/${item.eventId}`}
                  className="font-semibold underline"
                >
                  {item.title}
                </Link>
                <span className="text-sm text-neutral-500">
                  Ended {formatDate(item.endTime)}
                </span>
                {user?.id === userId && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void hideHistory(item.eventId)}
                  >
                    Hide from my history
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {historyNextPage !== null && (
            <Button variant="outline" onClick={() => void loadMoreHistory()}>
              Load more history
            </Button>
          )}
        </section>
      )}
      <section className="space-y-5">
        <h2>Organized events</h2>
        {eventsLoading ? (
          <EventCardsSkeleton count={3} />
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
          <Button variant="outline" onClick={loadMore} loading={loadingMore}>
            Load more
          </Button>
        )}
        {eventsError && <Notice message={eventsError} tone="error" />}
      </section>
    </div>
  );
}
