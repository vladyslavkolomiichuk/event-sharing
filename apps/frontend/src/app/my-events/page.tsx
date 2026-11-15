import type { Metadata } from 'next';
import Link from 'next/link';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventList } from '@/components/events/EventList';
import { Button } from '@/components/ui/button';
export const metadata: Metadata = { title: 'My events' };

export default function MyEventsPage() {
  return (
    <RequireAuth role="ORGANIZER">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="space-y-3">
            <p className="text-sm font-medium text-neutral-500">
              Organizer workspace
            </p>
            <h1>My events</h1>
            <p className="text-neutral-600">
              Manage drafts, moderation, and registration.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild variant="outline">
              <Link href="/payouts">Payouts</Link>
            </Button>
            <Button asChild>
              <Link href="/events/new">Create event</Link>
            </Button>
          </div>
        </div>
        <EventList mine />
      </div>
    </RequireAuth>
  );
}
