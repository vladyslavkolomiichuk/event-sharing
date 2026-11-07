'use client';

import { RowsSkeleton } from '@/components/feedback/Skeletons';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  invitationClient,
  type PersonalInvite,
} from '@/lib/api/InvitationClient';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';

export function InvitationsWorkspace() {
  const [items, setItems] = useState<PersonalInvite[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    setItems(await invitationClient.incoming());
  }

  useEffect(() => {
    void load()
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load invitations.',
        ),
      )
      .finally(() => setLoaded(true));
  }, []);

  async function decide(invite: PersonalInvite, action: 'accept' | 'decline') {
    setBusyId(invite.id);
    setError('');
    try {
      if (action === 'accept') await invitationClient.accept(invite.id);
      else await invitationClient.decline(invite.id);
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update invitation.',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <h1>Event invitations</h1>
      {error && <Notice message={error} tone="error" />}
      {!loaded && (
        <RowsSkeleton label="Loading invitations" rows={3} action framed />
      )}
      {loaded && items.length === 0 && (
        <p className="rounded-xl border border-neutral-200 bg-white p-7 text-neutral-600">
          No invitations yet.
        </p>
      )}
      <ul className="space-y-3">
        {items.map((invite) => (
          <li
            key={invite.id}
            className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
          >
            <h2>{invite.title ?? 'Event'}</h2>
            <p className="text-sm text-neutral-600">
              {invite.status} · Expires{' '}
              {new Date(invite.expiresAt).toLocaleDateString('en-US')}
            </p>
            <div className="flex flex-wrap gap-2">
              {invite.status === 'PENDING' && (
                <>
                  <Button
                    disabled={busyId === invite.id}
                    onClick={() => void decide(invite, 'accept')}
                  >
                    Accept
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busyId === invite.id}
                    onClick={() => void decide(invite, 'decline')}
                  >
                    Decline
                  </Button>
                </>
              )}
              {invite.status === 'ACCEPTED' && (
                <Button asChild variant="outline">
                  <Link href={`/events/${invite.eventId}`}>Open event</Link>
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
