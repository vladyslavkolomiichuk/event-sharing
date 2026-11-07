'use client';

import Link from 'next/link';
import { useChatUnread } from '@/contexts/ChatUnreadContext';
import { Button } from '@/components/ui/button';
import { RowsSkeleton } from '@/components/feedback/Skeletons';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { UnreadCountBadge } from './UnreadCountBadge';

export function ChatsOverview() {
  const { events, totalUnread, loading, error, refresh } = useChatUnread();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1>Chats</h1>
          <p className="mt-2 text-neutral-600">
            {totalUnread > 0
              ? `${totalUnread} unread messages across your events.`
              : 'Conversations in events you organize or have joined.'}
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {error && <InlineFeedback message={error} tone="error" />}
      {loading ? (
        <RowsSkeleton label="Loading chats" avatar framed />
      ) : events.length === 0 && !error ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-neutral-600">
          No event chats are available yet.
        </div>
      ) : events.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
          {events.map((event) => (
            <Link
              key={event.eventId}
              href={`/events/${event.eventId}?view=chats`}
              className="flex items-center gap-4 border-b border-neutral-100 px-5 py-5 last:border-b-0 hover:bg-neutral-50"
            >
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-neutral-200 text-sm font-bold">
                {event.title.slice(0, 2).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {event.title}
                </span>
                <span className="mt-1 block text-xs text-neutral-500">
                  {event.lastMessageAt
                    ? `Last activity ${new Date(event.lastMessageAt).toLocaleString('en-US')}`
                    : 'No messages yet'}
                </span>
              </span>
              <UnreadCountBadge count={event.unreadCount} />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
