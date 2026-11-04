import Link from 'next/link';
import type { SearchEvent } from '@event-sharing/contracts';
import { EventStatusBadge } from './EventStatusBadge';
import { EventUnreadBadge } from '@/components/messages/EventUnreadBadge';
import { EventImage } from './EventImage';

export function ExploreEventItem({
  event,
  selected,
  onSelect,
  onRoute,
}: {
  event: SearchEvent;
  selected: boolean;
  onSelect: () => void;
  onRoute?: () => void;
}) {
  return (
    <article
      id={`event-result-${event.id}`}
      className={`overflow-hidden rounded-xl border bg-white transition-colors hover:border-orange-500 focus-within:border-orange-700 ${selected ? 'border-orange-700 bg-orange-50/30' : 'border-neutral-200'}`}
    >
      <Link
        href={`/events/${event.id}`}
        aria-label={`Open ${event.title}`}
        className="block rounded-t-xl p-3 focus-visible:outline-2 focus-visible:outline-orange-700"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {new Date(event.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              timeZone: event.timeZone,
            })}
          </span>
          <div className="flex items-center gap-2">
            <EventUnreadBadge eventId={event.id} />
            <EventStatusBadge status={event.status} />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <EventImage
            eventId={event.id}
            slot="avatar"
            className="h-12 w-12 shrink-0 rounded-lg object-cover"
          />
          <h3 className="line-clamp-2">{event.title}</h3>
        </div>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
          {event.categoryName || 'Uncategorized'}
        </p>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-neutral-600">
          {event.description}
        </p>
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
        <span>
          {event.location.region || 'Location not listed'}
          {event.distanceMeters !== null &&
            (event.location.visibility === 'PUBLIC'
              ? ` · ${(event.distanceMeters / 1000).toFixed(1)} km`
              : ` · about ${(event.distanceMeters / 1000).toFixed(1)} km`)}
        </span>
        <div className="flex gap-3">
          <button
            type="button"
            className="font-semibold text-orange-800 underline"
            onClick={onSelect}
          >
            Show on map
          </button>
          {onRoute && (
            <button
              type="button"
              className="font-semibold text-orange-800 underline"
              onClick={onRoute}
            >
              Plan route
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
