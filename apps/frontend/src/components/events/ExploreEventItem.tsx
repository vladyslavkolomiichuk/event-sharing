import Link from 'next/link';
import type { SearchEvent } from '@event-sharing/contracts';
import { EventStatusBadge } from './EventStatusBadge';
import { EventUnreadBadge } from '@/components/messages/EventUnreadBadge';

export function ExploreEventItem({
  event,
  selected,
  onSelect,
}: {
  event: SearchEvent;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      id={`event-result-${event.id}`}
      className={`rounded-xl border bg-white p-4 ${selected ? 'border-black' : 'border-neutral-200'}`}
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
      <h3 className="mt-4">
        <Link href={`/events/${event.id}`} className="hover:underline">
          {event.title}
        </Link>
      </h3>
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {event.categoryName || 'Uncategorized'}
      </p>
      <p className="mt-2 line-clamp-2 text-sm leading-6 text-neutral-600">
        {event.description}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-4 text-xs text-neutral-500">
        <span>
          {event.location.region || 'Location not listed'}
          {event.distanceMeters !== null &&
            ` · ${(event.distanceMeters / 1000).toFixed(1)} km`}
        </span>
        <button
          type="button"
          className="font-semibold text-black underline"
          onClick={onSelect}
        >
          Show on map
        </button>
      </div>
    </article>
  );
}
