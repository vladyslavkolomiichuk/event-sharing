'use client';

import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useChatUnread } from '@/contexts/ChatUnreadContext';
import { UnreadCountBadge } from './UnreadCountBadge';

export function ChatHeaderLink() {
  const { user } = useAuth();
  const { totalUnread } = useChatUnread();
  if (!user) return null;
  return (
    <Link
      href="/chats"
      className="inline-flex items-center gap-1.5 hover:text-black"
    >
      Chats <UnreadCountBadge count={totalUnread} />
    </Link>
  );
}
