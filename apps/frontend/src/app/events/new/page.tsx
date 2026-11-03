import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventForm } from '@/components/events/EventForm';
export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <RequireAuth role="ORGANIZER">
      <div className="space-y-8">
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
            Organizer workspace
          </p>
          <h1>{from ? 'Create the next event' : 'Create an event'}</h1>
          <p className="text-neutral-600">
            {from
              ? 'Review the copied details and choose new dates. The previous event and its participants remain in history.'
              : 'Start with a draft. You can review it before submitting for moderation.'}
          </p>
        </div>
        <EventForm copyFromId={from} />
      </div>
    </RequireAuth>
  );
}
