'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatRoom, CreateChatRoom } from '@event-sharing/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { messagesClient } from '@/lib/api/MessagesClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { ChatRoomList } from '@/components/messages/ChatRoomList';
import { ChatConversation } from '@/components/messages/ChatConversation';
import { invitationClient } from '@/lib/api/InvitationClient';

export function EventChats({
  eventId,
  eventTitle,
  canManage,
  canArchive,
  readOnly,
}: {
  eventId: string;
  eventTitle: string;
  canManage: boolean;
  canArchive: boolean;
  readOnly: boolean;
}) {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktop, setDesktop] = useState(false);
  const roomsRequest = useRef(0);
  const selectedRoom = rooms.find((room) => room.id === selectedId);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const refreshRooms = useCallback(async () => {
    const currentRequest = ++roomsRequest.current;
    try {
      const page = await messagesClient.rooms(eventId);
      if (roomsRequest.current !== currentRequest) return;
      setRooms(page.items);
      setSelectedId((current) =>
        page.items.some((room) => room.id === current)
          ? current
          : (page.items[0]?.id ?? ''),
      );
      setLocked(false);
      setError('');
    } catch (cause) {
      if (roomsRequest.current !== currentRequest) return;
      if (cause instanceof ApiError && cause.status === 403) {
        setRooms([]);
        setSelectedId('');
        setLocked(true);
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 404 || cause.code === 'CHAT_UNAVAILABLE')
      ) {
        setRooms([]);
        setSelectedId('');
        return;
      }
      setError(
        cause instanceof Error ? cause.message : 'Could not load event chats.',
      );
    }
  }, [eventId]);

  useEffect(() => {
    void refreshRooms();
    const changed = (signal: Event) => {
      const detail = (signal as CustomEvent<{ eventId?: string }>).detail;
      if (!detail?.eventId || detail.eventId === eventId) void refreshRooms();
    };
    window.addEventListener('messages:remote', changed);
    return () => {
      roomsRequest.current++;
      window.removeEventListener('messages:remote', changed);
    };
  }, [eventId, refreshRooms]);

  function changed() {
    void refreshRooms();
    window.dispatchEvent(new Event('messages:changed'));
  }

  async function createRoom(
    input: CreateChatRoom,
    usernames: string[],
  ): Promise<boolean> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const room = await messagesClient.createRoom(eventId, input);
      setRooms((current) => [...current, room]);
      setSelectedId(room.id);
      setMobileOpen(true);
      setNotice('Chat room created.');
      if (usernames.length) {
        try {
          await invitationClient.send(eventId, usernames);
        } catch {
          setNotice('Group created. Some event invitations could not be sent.');
        }
      }
      changed();
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not create chat room.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function archiveRoom(roomId: string): Promise<void> {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const archived = await messagesClient.archiveRoom(eventId, roomId);
      setRooms((current) =>
        current.map((room) =>
          room.id === roomId
            ? {
                ...room,
                status: archived.status,
                archivedAt: archived.archivedAt,
              }
            : room,
        ),
      );
      setNotice('Chat room archived.');
      changed();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not archive chat room.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (locked) {
    return (
      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-8">
        <h2>Event chats</h2>
        <p className="text-sm text-neutral-600">
          Join the event to access its chats. If you just joined, allow a few
          seconds for your access to update.
        </p>
        <Button variant="outline" onClick={() => void refreshRooms()}>
          Refresh chats
        </Button>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col lg:h-[42rem] lg:flex-row">
        <ChatRoomList
          rooms={rooms}
          selectedId={selectedId}
          canManage={canManage}
          busy={busy}
          mobileHidden={mobileOpen}
          onSelect={(roomId) => {
            setSelectedId(roomId);
            setMobileOpen(true);
          }}
          onCreate={createRoom}
        />
        {selectedRoom && user && (desktop || mobileOpen) ? (
          <ChatConversation
            key={selectedRoom.id}
            eventId={eventId}
            eventTitle={eventTitle}
            room={selectedRoom}
            userId={user.id}
            canManage={canManage}
            canArchive={canArchive}
            readOnly={readOnly || selectedRoom.status !== 'ACTIVE'}
            onActivity={changed}
            onArchive={archiveRoom}
            onBack={() => setMobileOpen(false)}
          />
        ) : desktop ? (
          <div className="grid min-h-96 flex-1 place-items-center bg-neutral-100 p-8 text-center text-sm text-neutral-600">
            {rooms.length > 0
              ? 'Select a chat to start talking.'
              : 'Waiting for chat rooms to become available.'}
          </div>
        ) : null}
      </div>
      {error && <InlineFeedback message={error} tone="error" />}
      {notice && <InlineFeedback message={notice} tone="success" />}
    </section>
  );
}
