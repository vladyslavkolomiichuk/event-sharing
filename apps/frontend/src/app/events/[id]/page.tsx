import { RequireAuth } from '@/components/auth/RequireAuth';
import { EventDetailView } from '@/components/events/EventDetailView';
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
        initialView={view === 'chats' ? 'chats' : 'information'}
      />
    </RequireAuth>
  );
}
