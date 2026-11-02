import Link from 'next/link';
import type { EventDetail } from '@event-sharing/contracts';
import { EventStatusBadge } from './EventStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { EventUnreadBadge } from '@/components/messages/EventUnreadBadge';

export function EventCard({ event }: { event: EventDetail }) {
  return (
    <Card className="transition-colors hover:border-neutral-500">
      <CardContent className="flex h-full flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
            {new Date(event.startTime).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <div className="flex items-center gap-2">
            <EventUnreadBadge eventId={event.id} />
            <EventStatusBadge status={event.status} />
          </div>
        </div>
        <div className="space-y-2">
          <h3>
            <Link href={`/events/${event.id}`} className="hover:underline">
              {event.title}
            </Link>
          </h3>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            {event.categoryName || 'Uncategorized'}
          </p>
          <p className="line-clamp-3 text-sm leading-6 text-neutral-600">
            {event.description}
          </p>
        </div>
        <div className="mt-auto flex justify-between border-t border-neutral-200 pt-4 text-sm text-neutral-500">
          <span>{event.location.region || 'Location not listed'}</span>
          <Link
            className="font-semibold text-black hover:underline"
            href={`/events/${event.id}`}
          >
            View event
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
