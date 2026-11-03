'use client';

import { useState } from 'react';
import type { ChatRoomAccess } from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChatMemberPicker, type ChatPerson } from './ChatMemberPicker';

export type ChatGroupDraft = {
  name: string;
  access: ChatRoomAccess;
  members: ChatPerson[];
};

export function ChatGroupDraftForm({
  groups,
  onChange,
}: {
  groups: ChatGroupDraft[];
  onChange: (groups: ChatGroupDraft[]) => void;
}) {
  const [name, setName] = useState('');
  const [access, setAccess] = useState<ChatRoomAccess>('SELECTED_MEMBERS');
  const [members, setMembers] = useState<ChatPerson[]>([]);

  function add() {
    const trimmed = name.trim();
    if (
      !trimmed ||
      trimmed.toLowerCase() === 'general' ||
      groups.some((group) => group.name.toLowerCase() === trimmed.toLowerCase())
    )
      return;
    onChange([...groups, { name: trimmed, access, members }]);
    setName('');
    setMembers([]);
  }

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
      <h2>Event chat groups</h2>
      <p className="text-sm text-neutral-600">
        Set up groups now. Selected people get access after joining the event.
      </p>
      {groups.map((group) => (
        <div
          key={group.name}
          className="flex items-center justify-between gap-3 border-b border-neutral-100 py-2 text-sm"
        >
          <span>
            {group.name} ·{' '}
            {group.access === 'ALL_PARTICIPANTS'
              ? 'All participants'
              : `${group.members.length} selected`}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange(groups.filter((item) => item !== group))}
          >
            Remove
          </Button>
        </div>
      ))}
      <div className="space-y-3">
        <Input
          aria-label="Group name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Group name"
        />
        <select
          value={access}
          onChange={(event) => setAccess(event.target.value as ChatRoomAccess)}
          className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
        >
          <option value="SELECTED_MEMBERS">Selected members only</option>
          <option value="ALL_PARTICIPANTS">All event participants</option>
        </select>
        {access === 'SELECTED_MEMBERS' && (
          <ChatMemberPicker selected={members} onChange={setMembers} />
        )}
        <Button
          type="button"
          variant="outline"
          disabled={!name.trim() || groups.length >= 19}
          onClick={add}
        >
          Add group
        </Button>
      </div>
    </section>
  );
}
