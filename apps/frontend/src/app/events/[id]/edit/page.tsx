import type { Metadata } from 'next';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventForm } from '@/components/events/EventForm';
export const metadata: Metadata = { title: 'Edit event' };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RequireAuth role="ORGANIZER">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-sm font-medium text-neutral-500">
            Organizer workspace
          </p>
          <h1>Edit event</h1>
        </div>
        <EventForm eventId={id} />
      </div>
    </RequireAuth>
  );
}
