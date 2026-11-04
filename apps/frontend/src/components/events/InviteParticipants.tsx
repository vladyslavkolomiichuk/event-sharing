'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import type { UserProfilePublic } from '@event-sharing/contracts';
import { friendsClient, type FriendPerson } from '@/lib/api/FriendsClient';
import { usersClient } from '@/lib/api/UsersClient';
import {
  invitationClient,
  type PersonalInvite,
} from '@/lib/api/InvitationClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/feedback/Notice';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';

type Person = Pick<FriendPerson, 'userId' | 'username' | 'name' | 'avatarUrl'>;

export function InviteParticipants({
  eventId,
  onSelectionChange,
}: {
  eventId?: string;
  onSelectionChange?: (usernames: string[]) => void;
}) {
  const [tab, setTab] = useState<'search' | 'friends'>('search');
  const [query, setQuery] = useState('');
  const [friends, setFriends] = useState<FriendPerson[]>([]);
  const [results, setResults] = useState<UserProfilePublic[]>([]);
  const [selected, setSelected] = useState<Person[]>([]);
  const [outgoing, setOutgoing] = useState<PersonalInvite[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function load() {
      const people: FriendPerson[] = [];
      for (let page = 0; page < 50; page++) {
        const batch = await friendsClient.list(page);
        people.push(...batch.friends);
        if (batch.nextPage === null) break;
      }
      setFriends(people);
    }
    void load().catch(() => setFriends([]));
  }, []);

  async function refreshOutgoing() {
    if (!eventId) return;
    const invites = await invitationClient.outgoing(eventId);
    setOutgoing(invites);
    const profiles = await usersClient.getMany(
      invites.map((invite) => invite.recipientId),
    );
    setNames(
      Object.fromEntries(
        profiles.map((person) => [
          person.userId,
          `${person.name} (@${person.username})`,
        ]),
      ),
    );
  }

  useEffect(() => {
    void refreshOutgoing().catch(() => setOutgoing([]));
  }, [eventId]);

  async function search(event: FormEvent) {
    event.preventDefault();
    try {
      const page = await usersClient.searchByUsername(query);
      setResults(page.items);
      setMessage('');
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not search users.',
      );
    }
  }

  function toggle(person: Person) {
    const next = selected.some((item) => item.userId === person.userId)
      ? selected.filter((item) => item.userId !== person.userId)
      : [...selected, person];
    setSelected(next);
    onSelectionChange?.(next.map((item) => item.username));
  }

  async function send() {
    if (!eventId || selected.length === 0) return;
    setBusy(true);
    try {
      const result = await invitationClient.send(
        eventId,
        selected.map((person) => person.username),
      );
      setMessage(
        `${result.sent.length} invitation(s) saved. ${result.skipped} skipped.`,
      );
      setSelected([]);
      onSelectionChange?.([]);
      await refreshOutgoing();
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not send invitations.',
      );
    } finally {
      setBusy(false);
    }
  }

  const shown =
    tab === 'friends'
      ? friends.filter((person) =>
          `${person.name} ${person.username}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
      : results;

  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6">
      <h2>Invite participants</h2>
      <p className="text-sm text-neutral-600">
        Invitations require confirmation. Draft event invitations are delivered
        when registration opens.
      </p>
      <div className="flex gap-2" role="tablist" aria-label="Find invitees">
        <Button
          type="button"
          variant={tab === 'search' ? 'default' : 'outline'}
          onClick={() => {
            setTab('search');
            setQuery('');
          }}
        >
          Search users
        </Button>
        <Button
          type="button"
          variant={tab === 'friends' ? 'default' : 'outline'}
          onClick={() => {
            setTab('friends');
            setQuery('');
          }}
        >
          Friends
        </Button>
      </div>
      <form className="flex gap-2" onSubmit={search}>
        <Input
          aria-label={
            tab === 'search' ? 'Search by username' : 'Search friends'
          }
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={tab === 'search' ? '@username' : 'Find a friend'}
          minLength={2}
        />
        {tab === 'search' && <Button type="submit">Find</Button>}
      </form>
      {shown.length === 0 && (
        <p className="text-sm text-neutral-500">No people to show.</p>
      )}
      <ul className="max-h-64 divide-y divide-neutral-200 overflow-y-auto">
        {shown.map((person) => (
          <li
            key={person.userId}
            className="flex items-center justify-between gap-3 py-3"
          >
            <div className="flex min-w-0 items-center gap-3">
              <ProfileAvatar name={person.name} avatarUrl={person.avatarUrl} />
              <Link
                href={`/u/${person.username}`}
                className="min-w-0 truncate text-sm"
              >
                {person.name}{' '}
                <span className="text-neutral-500">@{person.username}</span>
              </Link>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => toggle(person)}
            >
              {selected.some((item) => item.userId === person.userId)
                ? 'Remove'
                : 'Select'}
            </Button>
          </li>
        ))}
      </ul>
      {selected.length > 0 && (
        <div className="space-y-2">
          <h3>Selected people</h3>
          <p className="text-sm">
            {selected.map((person) => `@${person.username}`).join(', ')}
          </p>
          {eventId && (
            <Button disabled={busy} onClick={() => void send()}>
              {busy ? 'Sending…' : 'Send invitations'}
            </Button>
          )}
        </div>
      )}
      {message && (
        <Notice
          message={message}
          tone={message.startsWith('Could not') ? 'error' : 'success'}
        />
      )}
      {eventId && (
        <div className="space-y-2">
          <h3>Sent invitations</h3>
          {outgoing.length === 0 && (
            <p className="text-sm text-neutral-500">No invitations yet.</p>
          )}
          {outgoing.map((invite) => (
            <div
              key={invite.id}
              className="flex flex-wrap items-center gap-3 border-t py-2 text-sm"
            >
              <span>
                {names[invite.recipientId] ?? 'User'} · {invite.status}
              </span>
              {invite.status === 'PENDING' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void invitationClient
                      .revoke(invite.id)
                      .then(refreshOutgoing)
                      .catch((cause) =>
                        setMessage(
                          cause instanceof Error
                            ? cause.message
                            : 'Could not revoke invitation.',
                        ),
                      )
                  }
                >
                  Revoke
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
