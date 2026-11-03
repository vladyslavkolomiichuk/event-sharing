import Link from 'next/link';
import { EventsExplore } from '@/components/events/EventsExplore';
import { Button } from '@/components/ui/button';
export default function EventsPage() {
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Discover
          </p>
          <h1>Events</h1>
          <p className="text-neutral-600">
            Search nearby events or explore a city on the map.
          </p>
        </div>
        <Button asChild>
          <Link href="/events/new">Create an event</Link>
        </Button>
      </div>
      <EventsExplore />
    </div>
  );
}
