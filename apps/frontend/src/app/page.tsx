import Link from 'next/link';
import { EventsExplore } from '@/components/events/EventsExplore';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Discover
          </p>
          <h1>Explore events</h1>
          <p className="text-sm text-neutral-600">
            Search nearby events and plan a route on the map.
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
