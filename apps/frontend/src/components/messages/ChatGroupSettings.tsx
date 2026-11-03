'use client';

import { useEffect, useState } from 'react';
import type {
  ChatRoom,
  ChatRoomAccess,
  ChatRoomMember,
} from '@event-sharing/contracts';
import { messagesClient } from '@/lib/api/MessagesClient';
import { invitationClient } from '@/lib/api/InvitationClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/feedback/Notice';
import { ChatMemberPicker, type ChatPerson } from './ChatMemberPicker';

export function ChatGroupSettings({
  eventId,
  room,
  onChanged,
}: {
  eventId: string;
  room: ChatRoom;
  onChanged: () => void;
}) {
  const [name, setName] = useState(room.name);
  const [access, setAccess] = useState<ChatRoomAccess>(room.access);
  const [members, setMembers] = useState<ChatRoomMember[]>([]);
  const [selected, setSelected] = useState<ChatPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setName(room.name);
    setAccess(room.access);
  }, [room.name, room.access]);

  async function refresh() {
    const result = await messagesClient.members(eventId, room.id);
    setMembers(result.items);
  }

  useEffect(() => {
    void refresh().catch(() => setNotice('Could not load group members.'));
    const changed = (signal: Event) => {
      const detail = (
        signal as CustomEvent<{ eventId?: string; roomId?: string }>
      ).detail;
      if (
        (!detail?.eventId || detail.eventId === eventId) &&
        (!detail?.roomId || detail.roomId === room.id)
      )
        void refresh().catch(() => undefined);
    };
    window.addEventListener('messages:remote', changed);
    return () => window.removeEventListener('messages:remote', changed);
  }, [eventId, room.id]);

  async function save() {
    setBusy(true);
    try {
      await messagesClient.updateRoom(eventId, room.id, {
        name: name.trim(),
        access,
      });
      setNotice('Group settings saved.');
      onChanged();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : 'Could not save group.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!selected.length) return;
    setBusy(true);
    try {
      const result = await messagesClient.addMembers(
        eventId,
        room.id,
        selected.map((person) => person.userId),
      );
      setMembers(result.items);
      const pending = selected.filter((person) =>
        result.items.some(
          (member) =>
            member.userId === person.userId && member.status === 'PENDING',
        ),
      );
      if (pending.length) {
        try {
          await invitationClient.send(
            eventId,
            pending.map((person) => person.username),
          );
        } catch {
          setNotice(
            'Members selected, but some event invitations could not be sent.',
          );
        }
      }
      setSelected([]);
      onChanged();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : 'Could not add members.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(userId: string) {
    setBusy(true);
    try {
      await messagesClient.removeMember(eventId, room.id, userId);
      await refresh();
      onChanged();
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : 'Could not remove member.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="border-b border-neutral-200 bg-white px-5 py-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Group settings
      </summary>
      <div className="mt-4 space-y-4">
        <Input
          aria-label="Group name"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as ChatRoomAccess)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="SELECTED_MEMBERS">Selected members only</option>
          <option value="ALL_PARTICIPANTS">All event participants</option>
        </select>
        <p className="text-xs text-neutral-600">
          Access can change only before the first message, so older private
          messages stay private.
        </p>
        <Button
          type="button"
          size="sm"
          disabled={busy || !name.trim()}
          onClick={() => void save()}
        >
          Save settings
        </Button>
        {room.access === 'SELECTED_MEMBERS' && (
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Members</h4>
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>
                  {member.name} · {member.status.toLowerCase()}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void remove(member.userId)}
                >
                  Remove
                </Button>
              </div>
            ))}
            <ChatMemberPicker selected={selected} onChange={setSelected} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || !selected.length}
              onClick={() => void add()}
            >
              Add members
            </Button>
            <p className="text-xs text-neutral-600">
              Pending members can read this group only after joining the event.
            </p>
            <p className="text-xs text-neutral-600">
              Removed members lose access to group history. If readded, they see
              messages from their new join time.
            </p>
          </div>
        )}
        {notice && <Notice message={notice} />}
      </div>
    </details>
  );
}
