'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { EventDetail, UserProfilePublic } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { useAuth } from '@/contexts/AuthContext';
import { EventActions } from './EventActions';
import { RegistrationPanel } from './RegistrationPanel';
import { ParticipantsList } from './ParticipantsList';
import { Button } from '@/components/ui/button';
import { EventStatusBadge } from './EventStatusBadge';
import { Notice } from '@/components/feedback/Notice';
import { Loading } from '@/components/feedback/Loading';
import { UserProfileLink } from '@/components/profile/UserProfileLink';
import { EventAnnouncementForm } from './EventAnnouncementForm';
import { EventChats } from './EventChats';
import { EventChatSettings } from './EventChatSettings';
import { EventViewTabs, type EventView } from './EventViewTabs';
import { useChatUnread } from '@/contexts/ChatUnreadContext';

const editable = [
  'DRAFT',
  'REJECTED',
  'APPROVED',
  'PUBLISHED',
  'REGISTRATION_OPEN',
  'REGISTRATION_CLOSED',
];

export function EventDetailView({
  id,
  initialView,
}: {
  id: string;
  initialView: EventView;
}) {
  const { user, loading: authLoading } = useAuth();
  const { unreadForEvent } = useChatUnread();
  const [view, setView] = useState<EventView>(initialView);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [organizer, setOrganizer] = useState<UserProfilePublic | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => setView(initialView), [id, initialView]);

  async function load() {
    try {
      const details = await eventsClient.get(id);
      setEvent(details);
      setOrganizer(
        await usersClient.get(details.organizerId).catch(() => null),
      );
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load event.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!authLoading && user) void load();
  }, [id, authLoading, user]);
  useEffect(() => {
    if (!user) return;
    const changed = (signal: Event) => {
      const detail = (
        signal as CustomEvent<{ eventId?: string; roomId?: string }>
      ).detail;
      if ((!detail?.eventId || detail.eventId === id) && !detail?.roomId)
        void load();
    };
    window.addEventListener('messages:remote', changed);
    return () => window.removeEventListener('messages:remote', changed);
  }, [id, user?.id]);
  useEffect(() => {
    if (!event?.pendingStatus) return;
    const timer = setInterval(() => {
      void load();
    }, 3000);
    return () => clearInterval(timer);
  }, [event?.pendingStatus, id]);
  if (authLoading || loading) return <Loading label="Loading event…" />;
  if (error && !event)
    return (
      <div className="space-y-4">
        <Notice message={error} tone="error" />
        <Button variant="outline" onClick={() => void load()}>
          Retry
        </Button>
      </div>
    );
  if (!event || !user)
    return (
      <div className="space-y-4">
        <Notice message="Sign in to view this event." />
        <Button asChild>
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  const isOwner = event.organizerId === user.id;
  const canManage = isOwner || user.role === 'ADMIN';
  const chatAvailable =
    event.chatEnabled &&
    [
      'PUBLISHED',
      'REGISTRATION_OPEN',
      'REGISTRATION_CLOSED',
      'IN_PROGRESS',
    ].includes(event.status);

  return (
    <div className="space-y-9">
      <div className="space-y-5 border-b border-neutral-200 pb-8">
        <div className="flex flex-wrap items-center gap-3">
          <EventStatusBadge status={event.status} />
          <span className="text-sm text-neutral-500">
            Event #{event.id.slice(0, 8)}
          </span>
        </div>
        <h1>{event.title}</h1>
        <p className="text-sm font-semibold text-neutral-600">
          Category: {event.categoryName || 'Uncategorized'}
        </p>
        <p className="max-w-3xl whitespace-pre-wrap text-lg leading-8 text-neutral-600">
          {event.description}
        </p>
        <Button variant="ghost" size="sm" onClick={() => void load()}>
          Refresh details
        </Button>
        {canManage && editable.includes(event.status) && (
          <Button asChild variant="outline">
            <Link href={`/events/${id}/edit`}>Edit event</Link>
          </Button>
        )}
      </div>
      <EventViewTabs
        view={view}
        onChange={setView}
        unreadCount={unreadForEvent(id)}
      />
      {view === 'information' ? (
        <div
          id="event-information-panel"
          role="tabpanel"
          aria-labelledby="event-information-tab"
          className="grid gap-8 lg:grid-cols-[1.4fr_0.6fr]"
        >
          <div className="space-y-8">
            <section className="rounded-xl border border-neutral-200 bg-white p-7">
              <h2 className="mb-6">Details</h2>
              <dl className="grid gap-6 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Starts
                  </dt>
                  <dd className="mt-2">
                    {new Date(event.startTime).toLocaleString('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Ends
                  </dt>
                  <dd className="mt-2">
                    {new Date(event.endTime).toLocaleString('en-US', {
                      dateStyle: 'full',
                      timeStyle: 'short',
                    })}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Region
                  </dt>
                  <dd className="mt-2">
                    {event.location.region || 'Not specified'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                    Venue
                  </dt>
                  <dd className="mt-2">
                    {event.location.address ||
                      'Exact venue is shared with registered participants.'}
                  </dd>
                </div>
              </dl>
              {event.location.latitude !== null &&
                event.location.longitude !== null && (
                  <p className="mt-6 text-sm text-neutral-600">
                    Coordinates: {event.location.latitude},{' '}
                    {event.location.longitude}.{' '}
                    <a
                      className="underline"
                      href={`https://www.openstreetmap.org/?mlat=${event.location.latitude}&mlon=${event.location.longitude}#map=15/${event.location.latitude}/${event.location.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open map
                    </a>
                    <span className="mt-2 block text-xs text-neutral-500">
                      Opening the map shares these coordinates with
                      OpenStreetMap.
                    </span>
                  </p>
                )}
            </section>
            {canManage && (
              <section className="rounded-xl border border-neutral-200 bg-white p-7">
                <EventActions
                  event={event}
                  role={user.role}
                  onChanged={setEvent}
                />
              </section>
            )}
            {canManage &&
              [
                'DRAFT',
                'REJECTED',
                'APPROVED',
                'PUBLISHED',
                'REGISTRATION_OPEN',
                'REGISTRATION_CLOSED',
                'IN_PROGRESS',
              ].includes(event.status) && (
                <EventChatSettings event={event} onChanged={setEvent} />
              )}
            {canManage && (
              <section className="rounded-xl border border-neutral-200 bg-white p-7">
                <ParticipantsList eventId={id} />
              </section>
            )}
            {canManage &&
              [
                'PUBLISHED',
                'REGISTRATION_OPEN',
                'REGISTRATION_CLOSED',
                'IN_PROGRESS',
              ].includes(event.status) && (
                <EventAnnouncementForm eventId={id} />
              )}
          </div>
          <aside className="space-y-7">
            <section className="rounded-xl border border-neutral-200 bg-white p-7">
              <RegistrationPanel
                eventId={id}
                userId={user.id}
                isOwner={isOwner}
                revision={event.version}
                onMembershipChanged={() => void load()}
              />
            </section>
            <section className="rounded-xl border border-neutral-200 bg-white p-7">
              <h3 className="mb-3">Organizer</h3>
              <UserProfileLink userId={event.organizerId} profile={organizer} />
            </section>
            {event.moderationReason && (
              <p className="text-sm text-neutral-600">
                Moderation: {event.moderationReason}
              </p>
            )}
            {event.cancellationReason && (
              <p className="text-sm text-neutral-600">
                Cancellation: {event.cancellationReason}
              </p>
            )}
            {error && <Notice message={error} tone="error" />}
          </aside>
        </div>
      ) : (
        <div
          id="event-chats-panel"
          role="tabpanel"
          aria-labelledby="event-chats-tab"
        >
          {chatAvailable ? (
            <EventChats
              eventId={id}
              eventTitle={event.title}
              canManage={canManage}
            />
          ) : (
            <section className="rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">
              Event chats are unavailable. The organizer can enable them in the
              event settings while the event is active.
            </section>
          )}
        </div>
      )}
    </div>
  );
}
