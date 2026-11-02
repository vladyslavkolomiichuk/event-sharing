'use client';

import { useEffect, useState } from 'react';
import type { Availability } from '@event-sharing/contracts';
import { participationClient } from '@/lib/api/ParticipationClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';

export function RegistrationPanel({
  eventId,
  userId,
  isOwner,
  revision,
  onMembershipChanged,
}: {
  eventId: string;
  userId: string;
  isOwner: boolean;
  revision: number;
  onMembershipChanged: () => void;
}) {
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [joined, setJoined] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    try {
      const policy = await participationClient.availability(eventId);
      setAvailability(policy);
    } catch (cause) {
      if (!(cause instanceof ApiError && cause.status === 404))
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load availability.',
        );
    }
    try {
      let cursor: string | null = null;
      do {
        const page = await participationClient.mine(cursor ?? undefined);
        if (
          page.items.some(
            (item) => item.eventId === eventId && item.userId === userId,
          )
        ) {
          setJoined(true);
          return;
        }
        cursor = page.nextCursor;
      } while (cursor);
      setJoined(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load your registration.',
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, [eventId, userId, revision]);

  async function change() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (joined) await participationClient.leave(eventId);
      else await participationClient.join(eventId);
      setNotice(
        joined ? 'You have left this event.' : 'You joined this event.',
      );
      await refresh();
      onMembershipChanged();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not change registration.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3>Registration</h3>
      {availability ? (
        <>
          <p className="text-sm text-neutral-600">
            {availability.occupied} of {availability.capacity} places filled.{' '}
            {availability.status === 'OPEN'
              ? `${availability.available} available.`
              : `Registration ${availability.status.toLowerCase()}.`}
          </p>
          {!isOwner && (
            <Button
              onClick={() => void change()}
              disabled={
                busy ||
                (!joined &&
                  (availability.status !== 'OPEN' ||
                    availability.available === 0))
              }
              variant={joined ? 'outline' : 'default'}
            >
              {busy ? 'Updating…' : joined ? 'Leave event' : 'Join event'}
            </Button>
          )}
        </>
      ) : (
        <p className="text-sm text-neutral-600">
          Registration has not opened yet.
        </p>
      )}
      {notice && <Notice message={notice} tone="success" />}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
