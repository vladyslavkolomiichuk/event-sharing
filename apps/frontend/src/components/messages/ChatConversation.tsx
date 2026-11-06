'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChatMessage, ChatRoom } from '@event-sharing/contracts';
import { messagesClient } from '@/lib/api/MessagesClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatGroupSettings } from './ChatGroupSettings';
import { useToast } from '@/contexts/ToastContext';

export function ChatConversation({
  eventId,
  eventTitle,
  room,
  userId,
  canManage,
  canArchive,
  readOnly,
  onActivity,
  onArchive,
  onBack,
}: {
  eventId: string;
  eventTitle: string;
  room: ChatRoom;
  userId: string;
  canManage: boolean;
  canArchive: boolean;
  readOnly: boolean;
  onActivity: () => void;
  onArchive: (roomId: string) => Promise<void>;
  onBack: () => void;
}) {
  const { show } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    room.notificationsEnabled,
  );
  const [error, setError] = useState('');
  const [accessDenied, setAccessDenied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const readRef = useRef('');
  const knownLatestRef = useRef('');
  const draftIdRef = useRef('');
  const attemptedRef = useRef(false);
  const refreshIdRef = useRef(0);
  const activityRef = useRef(onActivity);
  activityRef.current = onActivity;

  useEffect(() => {
    setNotificationsEnabled(room.notificationsEnabled);
  }, [room.id, room.notificationsEnabled]);

  function denyAccess() {
    refreshIdRef.current++;
    setMessages([]);
    setBefore(null);
    setBody('');
    setAccessDenied(true);
    setError('');
    setLoading(false);
  }

  async function markRead(messageId: string) {
    if (document.visibilityState !== 'visible' || readRef.current === messageId)
      return;
    readRef.current = messageId;
    try {
      await messagesClient.markRead(eventId, room.id, messageId);
      activityRef.current();
    } catch (cause) {
      readRef.current = '';
      if (cause instanceof ApiError && cause.status === 403) denyAccess();
      else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not mark chat as read.',
        );
    }
  }

  useEffect(() => {
    let active = true;
    let initial = true;
    readRef.current = '';
    knownLatestRef.current = '';
    setMessages([]);
    setBefore(null);
    setLoading(true);
    setError('');
    setAccessDenied(false);
    refreshIdRef.current++;

    const refresh = async () => {
      const current = ++refreshIdRef.current;
      try {
        const page = await messagesClient.messages(eventId, room.id);
        const incoming = [...page.items];
        let cursor = page.nextBefore;
        while (
          knownLatestRef.current &&
          cursor &&
          !incoming.some((message) => message.id === knownLatestRef.current)
        ) {
          const older = await messagesClient.messages(eventId, room.id, cursor);
          incoming.push(...older.items);
          cursor = older.nextBefore;
        }
        if (!active || current !== refreshIdRef.current) return;
        knownLatestRef.current = page.items[0]?.id ?? knownLatestRef.current;
        const panel = scrollRef.current;
        const nearBottom =
          !panel ||
          panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80;
        const wasInitial = initial;
        setMessages((current) => {
          const combined = new Map(
            [...current, ...incoming].map((message) => [message.id, message]),
          );
          return [...combined.values()].sort(
            (left, right) =>
              left.createdAt.localeCompare(right.createdAt) ||
              left.id.localeCompare(right.id),
          );
        });
        if (initial) {
          setBefore(page.nextBefore);
          setLoading(false);
          initial = false;
        }
        if (wasInitial || nearBottom)
          window.requestAnimationFrame(() => {
            if (scrollRef.current)
              scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
          });
        const newest = page.items[0];
        if (newest && (wasInitial || nearBottom)) void markRead(newest.id);
      } catch (cause) {
        if (active && current === refreshIdRef.current) {
          if (cause instanceof ApiError && cause.status === 403) denyAccess();
          else
            setError(
              cause instanceof Error
                ? cause.message
                : 'Could not load chat messages.',
            );
          setLoading(false);
        }
      }
    };

    void refresh();
    const changed = (signal: Event) => {
      const detail = (
        signal as CustomEvent<{ eventId?: string; roomId?: string }>
      ).detail;
      if (
        (!detail?.eventId || detail.eventId === eventId) &&
        (!detail?.roomId || detail.roomId === room.id)
      )
        void refresh();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('messages:remote', changed);
    document.addEventListener('visibilitychange', visible);
    return () => {
      active = false;
      window.removeEventListener('messages:remote', changed);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [eventId, room.id]);

  async function loadOlder() {
    if (!before) return;
    setBusy(true);
    try {
      const panel = scrollRef.current;
      const previousHeight = panel?.scrollHeight ?? 0;
      const previousTop = panel?.scrollTop ?? 0;
      const page = await messagesClient.messages(eventId, room.id, before);
      setMessages((current) => {
        const combined = new Map(
          [...page.items, ...current].map((message) => [message.id, message]),
        );
        return [...combined.values()].sort(
          (left, right) =>
            left.createdAt.localeCompare(right.createdAt) ||
            left.id.localeCompare(right.id),
        );
      });
      setBefore(page.nextBefore);
      window.requestAnimationFrame(() => {
        if (panel)
          panel.scrollTop = panel.scrollHeight - previousHeight + previousTop;
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) denyAccess();
      else
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load older messages.',
        );
    } finally {
      setBusy(false);
    }
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (!draftIdRef.current) draftIdRef.current = crypto.randomUUID();
      attemptedRef.current = true;
      const message = await messagesClient.send(
        eventId,
        room.id,
        body.trim(),
        draftIdRef.current,
      );
      setMessages((current) =>
        current.some((item) => item.id === message.id)
          ? current
          : [...current, message],
      );
      knownLatestRef.current = message.id;
      setBody('');
      draftIdRef.current = '';
      attemptedRef.current = false;
      await markRead(message.id);
      window.requestAnimationFrame(() => {
        if (scrollRef.current)
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 403) denyAccess();
      else
        setError(
          cause instanceof Error ? cause.message : 'Could not send message.',
        );
    } finally {
      setBusy(false);
    }
  }

  async function toggleNotifications() {
    const enabled = !notificationsEnabled;
    setNotificationBusy(true);
    setError('');
    try {
      const result = await messagesClient.updateRoomNotifications(
        eventId,
        room.id,
        enabled,
      );
      setNotificationsEnabled(result.enabled);
      activityRef.current();
      show(
        result.enabled
          ? `Notifications enabled for ${room.name}.`
          : `Notifications muted for ${room.name}.`,
        'success',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not update chat notifications.',
      );
    } finally {
      setNotificationBusy(false);
    }
  }

  return (
    <div className="flex min-h-[36rem] min-w-0 flex-1 flex-col bg-neutral-100 lg:h-[42rem]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-semibold text-orange-800 lg:hidden"
          >
            Back
          </button>
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-neutral-300 text-xs font-bold">
            {room.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">{room.name}</h3>
            <p className="truncate text-xs text-neutral-500">{eventTitle}</p>
          </div>
        </div>
        {!accessDenied && (
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-pressed={!notificationsEnabled}
              disabled={notificationBusy}
              onClick={() => void toggleNotifications()}
            >
              {notificationsEnabled
                ? 'Mute notifications'
                : 'Enable notifications'}
            </Button>
            {canArchive && room.status !== 'ARCHIVED' && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void onArchive(room.id)}
              >
                Archive room
              </Button>
            )}
          </div>
        )}
      </div>
      {!accessDenied &&
        canManage &&
        room.status === 'ACTIVE' &&
        room.name !== 'General' && (
          <ChatGroupSettings
            eventId={eventId}
            room={room}
            onChanged={onActivity}
          />
        )}
      <div
        ref={scrollRef}
        onScroll={() => {
          const panel = scrollRef.current;
          const newest = messages.at(-1);
          if (
            panel &&
            newest &&
            panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80
          )
            void markRead(newest.id);
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-8"
      >
        {before && (
          <div className="text-center">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void loadOlder()}
            >
              Load older messages
            </Button>
          </div>
        )}
        {loading && (
          <p className="text-center text-sm text-neutral-600">
            Loading messages…
          </p>
        )}
        {!loading && messages.length === 0 && (
          <p className="mx-auto w-fit rounded-lg bg-white px-4 py-2 text-sm text-neutral-600 shadow-sm">
            Start the conversation.
          </p>
        )}
        {messages.map((message) => (
          <ChatMessageBubble
            key={message.id}
            message={message}
            own={message.senderId === userId}
          />
        ))}
      </div>
      {accessDenied ? (
        <div className="space-y-2 border-t border-neutral-200 bg-white p-4 text-center">
          <InlineFeedback
            message="Your access to this chat has ended. Messages and sending are unavailable."
            tone="warning"
          />
          <Button type="button" variant="outline" onClick={onBack}>
            Back to chats
          </Button>
        </div>
      ) : readOnly ? (
        <p className="border-t border-neutral-200 bg-white p-4 text-center text-sm text-neutral-600">
          {room.status === 'ARCHIVED'
            ? 'This chat is archived.'
            : 'This chat is read-only.'}{' '}
          Chat history is available to current members.
        </p>
      ) : (
        <form
          ref={formRef}
          onSubmit={send}
          className="flex items-end gap-3 border-t border-neutral-200 bg-white p-3 sm:p-4"
        >
          <label htmlFor="chat-message" className="sr-only">
            Message
          </label>
          <div className="min-w-0 flex-1">
            <Textarea
              id="chat-message"
              value={body}
              onChange={(event) => {
                if (attemptedRef.current) {
                  draftIdRef.current = '';
                  attemptedRef.current = false;
                }
                setBody(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  formRef.current?.requestSubmit();
                }
              }}
              maxLength={2000}
              validate={(value) => (value.trim() ? '' : 'Enter a message.')}
              rows={2}
              placeholder={`Message ${room.name}`}
              className="max-h-32 min-h-11 flex-1 resize-none border-0 bg-white"
            />
          </div>
          <Button disabled={busy || !body.trim()}>Send</Button>
        </form>
      )}
      {error && <InlineFeedback message={error} tone="error" />}
    </div>
  );
}
