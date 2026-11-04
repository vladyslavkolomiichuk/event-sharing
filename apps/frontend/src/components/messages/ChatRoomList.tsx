'use client';

import { useState, type FormEvent } from 'react';
import type {
  ChatRoom,
  ChatRoomAccess,
  CreateChatRoom,
} from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UnreadCountBadge } from './UnreadCountBadge';
import { ChatMemberPicker, type ChatPerson } from './ChatMemberPicker';

export function ChatRoomList({
  rooms,
  selectedId,
  canManage,
  busy,
  onSelect,
  onCreate,
  mobileHidden,
}: {
  rooms: ChatRoom[];
  selectedId: string;
  canManage: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onCreate: (input: CreateChatRoom, usernames: string[]) => Promise<boolean>;
  mobileHidden: boolean;
}) {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [access, setAccess] = useState<ChatRoomAccess>('SELECTED_MEMBERS');
  const [members, setMembers] = useState<ChatPerson[]>([]);
  const visible = rooms.filter((room) =>
    room.name.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const totalUnread = rooms.reduce(
    (count, room) => count + room.unreadCount,
    0,
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    if (
      !(await onCreate(
        {
          name: name.trim(),
          access,
          memberIds: members.map((person) => person.userId),
        },
        members.map((person) => person.username),
      ))
    )
      return;
    setName('');
    setMembers([]);
    setCreating(false);
  }

  return (
    <aside
      className={`${mobileHidden ? 'hidden lg:flex' : 'flex'} min-h-[36rem] min-w-0 flex-col border-b border-neutral-200 bg-white lg:min-h-0 lg:w-[340px] lg:shrink-0 lg:border-b-0 lg:border-r`}
    >
      <div className="space-y-4 border-b border-neutral-200 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Chats</h2>
            <p className="mt-1 text-xs text-neutral-500">
              {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'}
              {totalUnread > 0 ? `, ${totalUnread} unread` : ''}
            </p>
          </div>
          {canManage && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreating((value) => !value)}
            >
              New room
            </Button>
          )}
        </div>
        {creating && (
          <form onSubmit={submit} className="space-y-3">
            <Input
              aria-label="Room name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder="Room name"
              required
              autoFocus
            />
            <select
              value={access}
              onChange={(event) =>
                setAccess(event.target.value as ChatRoomAccess)
              }
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="SELECTED_MEMBERS">Selected members only</option>
              <option value="ALL_PARTICIPANTS">All participants</option>
            </select>
            {access === 'SELECTED_MEMBERS' && (
              <ChatMemberPicker selected={members} onChange={setMembers} />
            )}
            <Button disabled={busy || !name.trim()} size="sm">
              Create
            </Button>
          </form>
        )}
        <Input
          aria-label="Search chat rooms"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search chats"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {visible.map((room) => (
          <button
            key={room.id}
            type="button"
            onClick={() => onSelect(room.id)}
            className={`flex w-full items-center gap-3 border-b border-neutral-100 px-5 py-4 text-left transition-colors hover:bg-neutral-50 ${room.id === selectedId ? 'bg-emerald-50' : ''}`}
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-200 text-sm font-bold text-neutral-700">
              {room.name.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">
                  {room.name}
                  {room.status === 'ARCHIVED'
                    ? ' (Archived)'
                    : room.status === 'READ_ONLY'
                      ? ' (Read-only)'
                      : ''}
                </span>
                <span className="shrink-0 text-[11px] text-neutral-500">
                  {room.lastMessage
                    ? new Date(room.lastMessage.createdAt).toLocaleTimeString(
                        'en-US',
                        {
                          hour: 'numeric',
                          minute: '2-digit',
                        },
                      )
                    : ''}
                </span>
              </span>
              <span className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-neutral-500">
                  {room.lastMessage
                    ? `${room.lastMessage.senderName}: ${room.lastMessage.body}`
                    : 'No messages yet'}
                </span>
                <UnreadCountBadge count={room.unreadCount} />
              </span>
            </span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="p-5 text-sm text-neutral-500">
            No rooms match your search.
          </p>
        )}
      </div>
    </aside>
  );
}
