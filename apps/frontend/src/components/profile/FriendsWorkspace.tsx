'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  friendsClient,
  type FriendList,
  type FriendPerson,
} from '@/lib/api/FriendsClient';
import { usersClient, type UserSearchResult } from '@/lib/api/UsersClient';
import { ProfileAvatar } from './ProfileAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/feedback/Notice';

export type FriendsSection =
  'friends' | 'find' | 'received' | 'sent' | 'blocked';

const sections: { key: FriendsSection; label: string }[] = [
  { key: 'friends', label: 'Your friends' },
  { key: 'find', label: 'Find people' },
  { key: 'received', label: 'Received requests' },
  { key: 'sent', label: 'Sent requests' },
  { key: 'blocked', label: 'Blocked users' },
];

export function FriendsWorkspace({
  section = 'friends',
}: {
  section?: FriendsSection;
}) {
  const [list, setList] = useState<FriendList | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searched, setSearched] = useState(false);
  const [friendFilter, setFriendFilter] = useState('');
  const [friendSort, setFriendSort] = useState<'name' | 'username'>('name');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    setList(await friendsClient.list());
  }

  async function moreLists() {
    if (list?.nextPage === null || list?.nextPage === undefined || loadingMore)
      return;
    setLoadingMore(true);
    try {
      const next = await friendsClient.list(list.nextPage);
      setList((current) =>
        current?.nextPage === list.nextPage
          ? {
              nextPage: next.nextPage,
              friends: [...current.friends, ...next.friends],
              received: [...current.received, ...next.received],
              sent: [...current.sent, ...next.sent],
              blocked: [...current.blocked, ...next.blocked],
            }
          : current,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load more friends.',
      );
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void refresh().catch((cause) =>
      setError(
        cause instanceof Error ? cause.message : 'Could not load friends.',
      ),
    );
  }, []);

  async function search(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const page = await usersClient.searchByUsername(query.trim());
      setResults(page.items);
      setSearched(true);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not search users.',
      );
    }
  }

  async function more() {
    if (!cursor) return;
    try {
      const page = await usersClient.searchByUsername(query.trim(), cursor);
      setResults((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load more users.',
      );
    }
  }

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      if (searched && query.trim()) {
        const page = await usersClient.searchByUsername(query.trim());
        setResults(page.items);
        setCursor(page.nextCursor);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  function personLink(person: FriendPerson) {
    return (
      <Link className="font-medium underline" href={`/u/${person.username}`}>
        <span className="inline-flex items-center gap-2">
          <ProfileAvatar name={person.name} avatarUrl={person.avatarUrl} />
          {person.name}
        </span>{' '}
        <span className="text-neutral-500">@{person.username}</span>
      </Link>
    );
  }

  const shownFriends = [...(list?.friends ?? [])]
    .filter((person) =>
      `${person.name} ${person.username}`
        .toLowerCase()
        .includes(friendFilter.toLowerCase()),
    )
    .sort((left, right) => left[friendSort].localeCompare(right[friendSort]));

  return (
    <div className="space-y-7">
      <h1>Friends</h1>
      <Link className="text-sm font-medium underline" href="/invitations">
        Event invitations
      </Link>
      <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
        <nav
          aria-label="Friends sections"
          className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
        >
          {sections.map((item) => (
            <Link
              key={item.key}
              href={
                item.key === 'friends' ? '/friends' : `/friends/${item.key}`
              }
              aria-current={section === item.key ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 hover:bg-orange-50 ${section === item.key ? 'bg-orange-50 font-semibold text-orange-800' : 'text-neutral-600'}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          {section === 'find' && (
            <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Find people</h2>
              <form onSubmit={search} className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <Input
                    aria-label="Search by username"
                    minLength={2}
                    maxLength={31}
                    required
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by @username"
                  />
                </div>
                <Button>Search</Button>
              </form>
              <ul className="divide-y divide-neutral-200">
                {results.map((person) => (
                  <li
                    className="flex items-center justify-between gap-3 py-3"
                    key={person.userId}
                  >
                    {personLink(person)}
                    {person.relationship === 'NONE' ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(() => friendsClient.request(person.username))
                        }
                      >
                        Add friend
                      </Button>
                    ) : (
                      <span className="text-sm text-neutral-600">
                        {person.relationship === 'FRIENDS'
                          ? 'Friends'
                          : person.relationship === 'SENT'
                            ? 'Request sent'
                            : 'Request received'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {searched && results.length === 0 && (
                <p className="text-sm text-neutral-500">No users found.</p>
              )}
              {cursor && (
                <Button variant="outline" onClick={() => void more()}>
                  More results
                </Button>
              )}
            </section>
          )}
          {error && <Notice message={error} tone="error" />}
          {section === 'received' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Received requests</h2>
              {list?.received.length === 0 && <p>No requests.</p>}
              {list?.received.map(
                (request) =>
                  request.person && (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center gap-3"
                    >
                      {personLink(request.person)}
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            friendsClient.decide(request.id, 'ACCEPTED'),
                          )
                        }
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            friendsClient.decide(request.id, 'REJECTED'),
                          )
                        }
                      >
                        Decline
                      </Button>
                    </div>
                  ),
              )}
            </div>
          )}
          {section === 'sent' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Sent requests</h2>
              {list?.sent.length === 0 && <p>No pending requests.</p>}
              {list?.sent.map(
                (request) =>
                  request.person && (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center gap-3"
                    >
                      {personLink(request.person)}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            friendsClient.decide(request.id, 'CANCELLED'),
                          )
                        }
                      >
                        Cancel
                      </Button>
                    </div>
                  ),
              )}
            </div>
          )}
          {section === 'friends' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Your friends</h2>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Search friends"
                  value={friendFilter}
                  onChange={(event) => setFriendFilter(event.target.value)}
                  placeholder="Search loaded friends"
                />
                <select
                  aria-label="Sort friends"
                  className="rounded-md border border-neutral-300 bg-white px-3 py-2"
                  value={friendSort}
                  onChange={(event) =>
                    setFriendSort(event.target.value as 'name' | 'username')
                  }
                >
                  <option value="name">Sort by name</option>
                  <option value="username">Sort by username</option>
                </select>
              </div>
              <p className="text-sm text-neutral-600" role="status">
                {list
                  ? `${list.friends.length} friends loaded${list.nextPage !== null ? '; more pages available' : ''}. Search and sort apply to loaded friends.`
                  : 'Loading friends…'}
              </p>
              {list && shownFriends.length === 0 && (
                <p>
                  {friendFilter
                    ? list && list.nextPage !== null
                      ? 'No matches in the loaded friends. Load more to continue searching.'
                      : 'No matching friends.'
                    : list && list.nextPage !== null
                      ? 'No friends on this page. Load more to continue.'
                      : 'No friends yet.'}
                </p>
              )}
              {shownFriends.map((person) => (
                <div
                  key={person.userId}
                  className="flex flex-wrap items-center gap-3"
                >
                  {personLink(person)}
                  {confirmRemove === person.username ? (
                    <>
                      <span className="text-sm">Remove this friend?</span>
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            friendsClient.remove(person.username),
                          ).then(() => setConfirmRemove(null))
                        }
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmRemove(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirmRemove(person.username)}
                    >
                      Remove
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(() => friendsClient.block(person.username))
                    }
                  >
                    Block
                  </Button>
                </div>
              ))}
            </div>
          )}
          {section === 'blocked' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Blocked users</h2>
              {list?.blocked.length === 0 && <p>No blocked users.</p>}
              {list?.blocked.map((person) => (
                <div
                  key={person.userId}
                  className="flex flex-wrap items-center gap-3"
                >
                  {personLink(person)}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void act(() => friendsClient.unblock(person.username))
                    }
                  >
                    Unblock
                  </Button>
                </div>
              ))}
            </div>
          )}
          {section !== 'find' &&
            list?.nextPage !== null &&
            list?.nextPage !== undefined && (
              <Button
                variant="outline"
                disabled={loadingMore}
                onClick={() => void moreLists()}
              >
                {loadingMore ? 'Loading…' : 'Load more friends'}
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}
