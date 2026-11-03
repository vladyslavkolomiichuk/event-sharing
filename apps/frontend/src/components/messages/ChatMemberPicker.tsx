'use client';

import { useEffect, useState } from 'react';
import { friendsClient, type FriendPerson } from '@/lib/api/FriendsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ChatPerson = Pick<FriendPerson, 'userId' | 'username' | 'name'>;

export function ChatMemberPicker({
  selected,
  onChange,
}: {
  selected: ChatPerson[];
  onChange: (people: ChatPerson[]) => void;
}) {
  const [tab, setTab] = useState<'search' | 'friends'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChatPerson[]>([]);
  const [friends, setFriends] = useState<ChatPerson[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      const people: ChatPerson[] = [];
      for (let page = 0; page < 50; page++) {
        const batch = await friendsClient.list(page);
        people.push(...batch.friends);
        if (batch.nextPage === null) break;
      }
      setFriends(people);
    }
    void load().catch(() => setFriends([]));
  }, []);

  async function search() {
    try {
      const page = await usersClient.searchByUsername(query);
      setResults(page.items);
      setError('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not search users.',
      );
    }
  }

  function toggle(person: ChatPerson) {
    const exists = selected.some((item) => item.userId === person.userId);
    if (!exists && selected.length >= 50) return;
    onChange(
      exists
        ? selected.filter((item) => item.userId !== person.userId)
        : [...selected, person],
    );
  }

  const people =
    tab === 'friends'
      ? friends.filter((person) =>
          `${person.name} ${person.username}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
      : results;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant={tab === 'search' ? 'default' : 'outline'}
          onClick={() => setTab('search')}
        >
          Search
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === 'friends' ? 'default' : 'outline'}
          onClick={() => setTab('friends')}
        >
          Friends
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          aria-label="Search users by username"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="@username"
        />
        {tab === 'search' && (
          <Button type="button" size="sm" onClick={() => void search()}>
            Find
          </Button>
        )}
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="max-h-36 overflow-y-auto border border-neutral-200">
        {people.map((person) => (
          <button
            key={person.userId}
            type="button"
            onClick={() => toggle(person)}
            className="flex w-full justify-between gap-2 border-b border-neutral-100 px-3 py-2 text-left text-sm"
          >
            <span>
              {person.name} (@{person.username})
            </span>
            <span>
              {selected.some((item) => item.userId === person.userId)
                ? 'Selected'
                : 'Add'}
            </span>
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <p className="text-xs text-neutral-600">
          Selected: {selected.map((person) => `@${person.username}`).join(', ')}
        </p>
      )}
    </div>
  );
}
