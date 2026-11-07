'use client';

import { RowsSkeleton } from '@/components/feedback/Skeletons';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import {
  friendsClient,
  type FriendList,
  type FriendPerson,
} from '@/lib/api/FriendsClient';
import { useFriendSearch } from '@/lib/useFriendSearch';
import { usersClient, type UserSearchResult } from '@/lib/api/UsersClient';
import { ProfileAvatar } from './ProfileAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

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
  const friends = useFriendSearch(
    friendFilter,
    friendSort,
    section === 'friends',
  );
  const friendPage = friends.page;
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
      friends.refresh();
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

  const shownFriends = friendPage?.items ?? [];

  return (
    <div className="space-y-7">
      <h1>Friends</h1>
      <Link
        className="inline-flex items-center text-sm font-medium underline pointer-coarse:min-h-11"
        href="/invitations"
      >
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
              className={`inline-flex items-center pointer-coarse:min-h-11 shrink-0 rounded-lg px-3 py-2 hover:bg-orange-50 ${section === item.key ? 'bg-orange-50 font-semibold text-orange-800' : 'text-neutral-600'}`}
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
          {(error || friends.error) && (
            <InlineFeedback message={error || friends.error} tone="error" />
          )}
          {section === 'received' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Received requests</h2>
              {!list && !error && (
                <RowsSkeleton label="Loading requests" rows={3} action />
              )}
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
              {!list && !error && (
                <RowsSkeleton label="Loading requests" rows={3} action />
              )}
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
                  placeholder="Search friends"
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
              {friendPage ? (
                <p className="text-sm text-neutral-600" role="status">
                  {`${friendPage.items.length} friends shown${friendPage.nextPage !== null ? '; more results available' : ''}.`}
                </p>
              ) : (
                !friends.error && (
                  <RowsSkeleton label="Loading friends" avatar action />
                )
              )}
              {friendPage && shownFriends.length === 0 && (
                <p>
                  {friendFilter ? 'No matching friends.' : 'No friends yet.'}
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
                    onClick={() => {
                      if (
                        window.confirm(
                          `Block @${person.username}? This also removes them from your friends.`,
                        )
                      )
                        void act(() => friendsClient.block(person.username));
                    }}
                  >
                    Block
                  </Button>
                </div>
              ))}
              {friendPage?.nextPage !== null &&
                friendPage?.nextPage !== undefined && (
                  <Button
                    variant="outline"
                    onClick={() => void friends.loadMore()}
                    loading={friends.loadingMore}
                  >
                    Load more friends
                  </Button>
                )}
            </div>
          )}
          {section === 'blocked' && (
            <div className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6">
              <h2>Blocked users</h2>
              {!list && !error && (
                <RowsSkeleton label="Loading blocked users" rows={3} action />
              )}
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
            section !== 'friends' &&
            list?.nextPage !== null &&
            list?.nextPage !== undefined && (
              <Button
                variant="outline"
                onClick={() => void moreLists()}
                loading={loadingMore}
              >
                Load more friends
              </Button>
            )}
        </div>
      </div>
    </div>
  );
}
