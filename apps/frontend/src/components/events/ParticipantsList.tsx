'use client';

import { useEffect, useState } from 'react';
import type { Membership, UserProfilePublic } from '@event-sharing/contracts';
import { participationClient } from '@/lib/api/ParticipationClient';
import { usersClient } from '@/lib/api/UsersClient';
import { UserProfileLink } from '@/components/profile/UserProfileLink';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';

export function ParticipantsList({ eventId }: { eventId: string }) {
  const [items, setItems] = useState<Membership[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfilePublic>>(
    {},
  );
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load(next?: string) {
    setBusy(true);
    setError('');
    try {
      const page = await participationClient.participants(eventId, next);
      setItems((previous) =>
        next ? [...previous, ...page.items] : page.items,
      );
      setCursor(page.nextCursor);
      const loaded = await usersClient.getMany(
        page.items.map((item) => item.userId),
      );
      setProfiles((previous) => ({
        ...previous,
        ...Object.fromEntries(
          loaded.map((profile) => [profile.userId, profile]),
        ),
      }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load participants.',
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [eventId]);
  return (
    <div className="space-y-4">
      <h3>Participants</h3>
      <p className="text-sm text-neutral-600">
        {items.length ? `${items.length} shown` : 'No participants yet.'}
      </p>
      {items.length > 0 && (
        <ul className="divide-y divide-neutral-200 text-sm">
          {items.map((item) => (
            <li
              key={item.userId}
              className="flex flex-wrap justify-between gap-2 py-3"
            >
              <UserProfileLink
                userId={item.userId}
                profile={profiles[item.userId] ?? null}
              />
              <span className="text-neutral-500">
                Joined {new Date(item.joinedAt).toLocaleDateString('en-US')}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void load(cursor)}
        >
          Load more
        </Button>
      )}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
