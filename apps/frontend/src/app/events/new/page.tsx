import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventForm } from '@/components/events/EventForm';
export default function NewEventPage() {
  return (
    <RequireAuth role="ORGANIZER">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Organizer workspace
          </p>
          <h1>Create an event</h1>
          <p className="text-neutral-600">
            Start with a draft. You can review it before submitting for
            moderation.
          </p>
        </div>
        <EventForm />
      </div>
    </RequireAuth>
  );
}
