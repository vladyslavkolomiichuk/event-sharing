import type { Metadata } from 'next';
import { EventsExplore } from '@/components/events/EventsExplore';
export const metadata: Metadata = { title: 'Explore events' };

export default function EventsPage() {
  return <EventsExplore />;
}
