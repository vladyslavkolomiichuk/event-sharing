'use client';

import { UnreadCountBadge } from '@/components/messages/UnreadCountBadge';

export type EventView = 'information' | 'chats';

export function EventViewTabs({
  view,
  onChange,
  unreadCount,
}: {
  view: EventView;
  onChange: (view: EventView) => void;
  unreadCount: number;
}) {
  return (
    <div
      className="flex gap-2 border-b border-neutral-200"
      role="tablist"
      aria-label="Event sections"
    >
      <button
        type="button"
        role="tab"
        id="event-information-tab"
        aria-controls="event-information-panel"
        aria-selected={view === 'information'}
        onClick={() => onChange('information')}
        className={`border-b-2 px-5 py-3 text-sm font-semibold ${view === 'information' ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-500 hover:text-neutral-950'}`}
      >
        Information
      </button>
      <button
        type="button"
        role="tab"
        id="event-chats-tab"
        aria-controls="event-chats-panel"
        aria-selected={view === 'chats'}
        onClick={() => onChange('chats')}
        className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-semibold ${view === 'chats' ? 'border-emerald-700 text-neutral-950' : 'border-transparent text-neutral-500 hover:text-neutral-950'}`}
      >
        Chats <UnreadCountBadge count={unreadCount} />
      </button>
    </div>
  );
}
