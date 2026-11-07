'use client';

import { RowsSkeleton } from '@/components/feedback/Skeletons';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  EventSearchResultSchema,
  type SearchEvent,
} from '@event-sharing/contracts';
import { gateway } from '@/lib/api/GatewayClient';
import { selectPublicMapEvents } from '@/lib/public-event-map';
import {
  MapView,
  type MapMarker,
  type MapPoint,
} from '@/components/map/MapView';
import { Button } from '@/components/ui/button';
import { EventImage } from './EventImage';

const worldCenter: MapPoint = { latitude: 15, longitude: 0 };

export function PublicLanding() {
  const [candidates, setCandidates] = useState<SearchEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [center, setCenter] = useState<MapPoint>(worldCenter);
  const [zoom, setZoom] = useState(0.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setZoom(window.matchMedia('(max-width: 639px)').matches ? -0.6 : 0.4);
  }, []);

  useEffect(() => {
    let active = true;
    // This feed must contain only public events with server-rounded locations.
    void gateway
      .get<unknown>('/api/public/events/map?limit=100')
      .then((response) => {
        const parsed = EventSearchResultSchema.safeParse(response);
        if (!parsed.success) throw new Error('Invalid public map response.');
        if (active) setCandidates(parsed.data.items);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const events = useMemo(() => selectPublicMapEvents(candidates), [candidates]);
  const selected = events.find((event) => event.id === selectedId);
  const markers = useMemo<MapMarker[]>(
    () =>
      events.map((event) => ({
        id: event.id,
        label: `${event.title}; approximate public location`,
        ...event.mapPoint,
        approximate: true,
        avatarUrl: `/backend/api/public/events/${event.id}/avatar`,
      })),
    [events],
  );

  function selectEvent(id: string) {
    const event = events.find((item) => item.id === id);
    if (!event) return;
    setSelectedId(id);
    setCenter(event.mapPoint);
    setZoom(6);
  }

  return (
    <div className="public-landing space-y-8 pb-10">
      <section className="rounded-2xl border border-orange-200 bg-[var(--accent-soft)] px-6 py-10 sm:px-10 sm:py-14">
        <div className="max-w-3xl space-y-5">
          <p className="text-sm font-medium text-[var(--accent-ink)]">
            Find your people, wherever you are
          </p>
          <h1 className="max-w-2xl text-[clamp(2.3rem,5vw,4.5rem)] leading-[1.02] tracking-[-0.03em] text-[#41291b]">
            Good things happen when people meet
          </h1>
          <p className="max-w-2xl text-lg leading-7 text-[#654838]">
            Event Sharing helps you discover local gatherings, join the ones you
            love, and bring people together around your own ideas. Explore the
            world map, find a place, and start with an event that feels right
            for you.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">Create an account</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3" aria-label="How it works">
        {[
          [
            '01',
            'Discover',
            'Look around the map or search by place and interest.',
          ],
          [
            '02',
            'Join',
            'See the details, register, and stay connected with your group.',
          ],
          [
            '03',
            'Host',
            'Create an event and invite people to share the moment.',
          ],
        ].map(([number, title, description]) => (
          <div
            key={number}
            className="rounded-2xl border border-neutral-200 bg-white p-5"
          >
            <span className="text-sm font-bold text-[var(--accent-ink)]">
              {number}
            </span>
            <h2 className="mt-3">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-neutral-600">
              {description}
            </p>
          </div>
        ))}
      </section>

      <section aria-labelledby="world-events-title" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-[var(--accent-ink)]">
              Explore the world
            </p>
            <h2 id="world-events-title" className="mt-1">
              A place to begin
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-neutral-600">
              Choose a public event on the map. Pins show rounded locations to
              keep this first look approximate.
            </p>
          </div>
          {!loading && (
            <span className="text-sm tabular-nums text-neutral-600">
              {events.length} {events.length === 1 ? 'event' : 'events'} shown
            </span>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="relative h-[440px] overflow-hidden rounded-2xl sm:h-[560px]">
            <MapView
              center={center}
              zoom={zoom}
              markers={markers}
              selectedMarkerId={selectedId}
              onMarkerClick={selectEvent}
              className="h-full w-full rounded-2xl"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="absolute left-3 top-3 z-10 shadow-sm"
              onClick={() => {
                setSelectedId(null);
                setCenter(worldCenter);
                setZoom(
                  window.matchMedia('(max-width: 639px)').matches ? -0.6 : 0.4,
                );
              }}
            >
              Show world
            </Button>
            {selected && (
              <div className="absolute bottom-4 left-4 right-4 z-10 rounded-xl border border-orange-200 bg-white p-4 shadow-lg sm:right-auto sm:w-80">
                <div className="flex items-center gap-3">
                  <EventImage
                    eventId={selected.id}
                    slot="avatar"
                    publicImage
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <div className="min-w-0">
                    <h3 className="line-clamp-2 text-base">{selected.title}</h3>
                    <p className="text-xs text-neutral-600">
                      {selected.location.region || 'Location not listed'} ·
                      approximate pin
                    </p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-neutral-600">
                  {selected.description}
                </p>
                <p className="mt-2 text-xs font-medium text-neutral-600">
                  {new Date(selected.startTime).toLocaleString('en-US', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                    timeZone: selected.timeZone,
                  })}
                </p>
                <Button asChild size="sm" className="mt-3">
                  <Link
                    href={`/sign-in?returnTo=${encodeURIComponent(`/events/${selected.id}`)}`}
                  >
                    Sign in to view event
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <aside
            className="min-h-0 overflow-hidden rounded-2xl border border-neutral-200 bg-white lg:h-[560px]"
            aria-label="Events on the map"
          >
            <div className="border-b border-neutral-200 px-4 py-3 text-sm font-semibold">
              Events around the world
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto p-3 lg:max-h-[510px]">
              {loading && <RowsSkeleton label="Loading public events" avatar />}
              {error && (
                <p
                  role="status"
                  className="rounded-lg bg-[var(--accent-soft)] p-3 text-sm text-[var(--accent-ink)]"
                >
                  The public event preview is unavailable right now. Sign in to
                  explore events.
                </p>
              )}
              {!loading && !error && !events.length && (
                <p className="p-3 text-sm text-neutral-600">
                  No public events are available yet.
                </p>
              )}
              {events.map((event) => (
                <button
                  key={event.id}
                  id={`public-event-${event.id}`}
                  type="button"
                  aria-pressed={selectedId === event.id}
                  onClick={() => selectEvent(event.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:border-[var(--accent)] ${selectedId === event.id ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-neutral-200'}`}
                >
                  <EventImage
                    eventId={event.id}
                    slot="avatar"
                    publicImage
                    className="h-12 w-12 shrink-0 rounded-lg object-cover"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {event.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-neutral-600">
                      {event.location.region || 'Location not listed'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
