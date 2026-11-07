import Link from 'next/link';
import type { EventDetail } from '@event-sharing/contracts';
import { EventStatusBadge } from './EventStatusBadge';
import { Card, CardContent } from '@/components/ui/card';
import { EventUnreadBadge } from '@/components/messages/EventUnreadBadge';
import { EventImage } from './EventImage';

export function EventCard({
  event,
  relationship,
}: {
  event: EventDetail;
  relationship?: string;
}) {
  return (
    <Card className="h-full transition-colors hover:border-neutral-500 focus-within:border-black">
      <Link
        href={`/events/${event.id}`}
        className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-black"
      >
        <CardContent className="flex h-full flex-col gap-5">
          <EventImage
            eventId={event.id}
            slot="avatar"
            className="h-20 w-20 rounded-xl object-cover"
          />
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-neutral-500">
              {new Date(event.startTime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: event.timeZone,
              })}
            </p>
            <div className="flex items-center gap-2">
              <EventUnreadBadge eventId={event.id} />
              <EventStatusBadge status={event.status} />
              {relationship && (
                <span className="text-xs font-semibold text-neutral-600">
                  {relationship}
                </span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <h3>{event.title}</h3>
            <p className="text-sm text-neutral-500">
              {event.categoryName || 'Uncategorized'}
            </p>
            <p className="line-clamp-3 text-sm leading-6 text-neutral-600">
              {event.description}
            </p>
          </div>
          <div className="mt-auto flex justify-between gap-3 border-t border-neutral-200 pt-4 text-sm text-neutral-500">
            <span className="min-w-0 truncate">
              {event.location.region || 'Location not listed'}
            </span>
            <span className="shrink-0 font-semibold text-black underline">
              View event
            </span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}
