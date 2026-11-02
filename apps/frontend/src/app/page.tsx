import Link from 'next/link';
import { EventList } from '@/components/events/EventList';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <div className="space-y-16">
      <section className="grid gap-10 border-b border-neutral-200 pb-14 pt-8 lg:grid-cols-[1.4fr_0.6fr] lg:items-end">
        <div className="space-y-7">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-neutral-500">
            Events, made simple
          </p>
          <h1 className="max-w-4xl">
            Bring people together around what matters.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-neutral-600">
            Discover events, reserve a place, or organize an experience for your
            community.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/events">Explore events</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/events/new">Create an event</Link>
            </Button>
          </div>
        </div>
        <div className="border-l border-neutral-300 pl-6 text-sm leading-7 text-neutral-600">
          <p className="font-semibold text-black">One place for every stage.</p>
          <p>
            Create a draft, submit it for review, open registration, and keep
            everyone informed.
          </p>
        </div>
      </section>
      <section className="space-y-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-500">
              What's happening
            </p>
            <h2>Upcoming events</h2>
          </div>
          <Link href="/events" className="text-sm font-semibold underline">
            All events
          </Link>
        </div>
        <EventList compact />
      </section>
    </div>
  );
}
