'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  needsUsernameSelection,
  type ChatOverview,
} from '@event-sharing/contracts';
import { messagesClient } from '@/lib/api/MessagesClient';
import { useAuth } from './AuthContext';

type ChatUnreadState = ChatOverview & {
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  unreadForEvent: (eventId: string) => number;
};

const empty: ChatOverview = { totalUnread: 0, events: [] };
const ChatUnreadContext = createContext<ChatUnreadState | null>(null);

export function ChatUnreadProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [overview, setOverview] = useState<ChatOverview>(empty);
  const [overviewOwnerId, setOverviewOwnerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const activeUserId = useRef<string | null>(null);
  const requestId = useRef(0);
  activeUserId.current = user?.id ?? null;

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    const requestedUserId =
      user && !needsUsernameSelection(user.username) ? user.id : null;
    if (!requestedUserId) {
      setOverview(empty);
      setOverviewOwnerId(null);
      setLoading(false);
      setError('');
      return;
    }
    try {
      const next = await messagesClient.overview();
      if (
        activeUserId.current === requestedUserId &&
        requestId.current === currentRequest
      ) {
        setOverview(next);
        setOverviewOwnerId(requestedUserId);
        setError('');
      }
    } catch {
      if (
        activeUserId.current === requestedUserId &&
        requestId.current === currentRequest
      )
        setError('Could not load event chats.');
    } finally {
      if (
        activeUserId.current === requestedUserId &&
        requestId.current === currentRequest
      )
        setLoading(false);
    }
  }, [user?.id, user?.username]);

  useEffect(() => {
    setOverview(empty);
    setOverviewOwnerId(null);
    setLoading(true);
    void refresh();
    if (!user) return;
    const changed = () => void refresh();
    window.addEventListener('messages:changed', changed);
    window.addEventListener('messages:remote', changed);
    return () => {
      window.removeEventListener('messages:changed', changed);
      window.removeEventListener('messages:remote', changed);
    };
  }, [user?.id, refresh]);

  const visibleOverview =
    user && overviewOwnerId === user.id ? overview : empty;
  const unreadForEvent = (eventId: string) =>
    visibleOverview.events.find((event) => event.eventId === eventId)
      ?.unreadCount ?? 0;

  return (
    <ChatUnreadContext.Provider
      value={{ ...visibleOverview, loading, error, refresh, unreadForEvent }}
    >
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread(): ChatUnreadState {
  const state = useContext(ChatUnreadContext);
  if (!state) throw new Error('ChatUnreadProvider is missing.');
  return state;
}
