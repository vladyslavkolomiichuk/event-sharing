import Link from 'next/link';
import { UnreadCountBadge } from '@/components/messages/UnreadCountBadge';

export const EVENT_SECTIONS = [
  'information',
  'route',
  'participants',
  'announcements',
  'invitations',
  'settings',
  'chats',
] as const;

export type EventSection = (typeof EVENT_SECTIONS)[number];

const labels: Record<EventSection, string> = {
  information: 'Information',
  route: 'Route',
  participants: 'Participants',
  announcements: 'Announcements',
  invitations: 'Invitations',
  settings: 'Event settings',
  chats: 'Chats',
};

export function EventNavigation({
  eventId,
  section,
  sections,
  unreadCount,
}: {
  eventId: string;
  section: EventSection;
  sections: EventSection[];
  unreadCount: number;
}) {
  return (
    <nav
      aria-label="Event sections"
      className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
    >
      {sections.map((item) => (
        <Link
          key={item}
          href={
            item === 'information'
              ? `/events/${eventId}`
              : `/events/${eventId}?view=${item}`
          }
          aria-current={section === item ? 'page' : undefined}
          className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3 py-2 pointer-coarse:min-h-11 hover:bg-orange-50 ${section === item ? 'bg-orange-50 font-semibold text-orange-800' : 'text-neutral-600'}`}
        >
          {labels[item]}
          {item === 'chats' && <UnreadCountBadge count={unreadCount} />}
        </Link>
      ))}
    </nav>
  );
}
