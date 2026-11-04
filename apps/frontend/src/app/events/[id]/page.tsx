import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventDetailView } from '@/components/events/EventDetailView';
import {
  EVENT_SECTIONS,
  type EventSection,
} from '@/components/events/EventNavigation';
export default async function EventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { id } = await params;
  const { view } = await searchParams;
  return (
    <RequireAuth>
      <EventDetailView
        id={id}
        section={
          EVENT_SECTIONS.includes(view as EventSection)
            ? (view as EventSection)
            : 'information'
        }
      />
    </RequireAuth>
  );
}
