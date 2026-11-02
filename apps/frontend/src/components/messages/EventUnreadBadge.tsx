'use client';

import { useChatUnread } from '@/contexts/ChatUnreadContext';
import { UnreadCountBadge } from './UnreadCountBadge';

export function EventUnreadBadge({ eventId }: { eventId: string }) {
  const { unreadForEvent } = useChatUnread();
  return <UnreadCountBadge count={unreadForEvent(eventId)} />;
}
