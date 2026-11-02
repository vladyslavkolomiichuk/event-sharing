import Link from 'next/link';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventList } from '@/components/events/EventList';
import { Button } from '@/components/ui/button';
export default function MyEventsPage() {
  return (
    <RequireAuth role="ORGANIZER">
      <div className="space-y-8">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
              Organizer workspace
            </p>
            <h1>My events</h1>
            <p className="text-neutral-600">
              Manage drafts, moderation, and registration.
            </p>
          </div>
          <Button asChild>
            <Link href="/events/new">Create event</Link>
          </Button>
        </div>
        <EventList mine />
      </div>
    </RequireAuth>
  );
}
