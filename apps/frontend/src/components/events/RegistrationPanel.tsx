'use client';

import { LoadingRegion } from '@/components/feedback/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect, useState } from 'react';
import type { Availability } from '@event-sharing/contracts';
import { participationClient } from '@/lib/api/ParticipationClient';
import { ApiError } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const policy = await participationClient.availability(eventId);
      setAvailability(policy);
    } catch (cause) {
      setAvailability(null);
      if (!(cause instanceof ApiError && cause.status === 404))
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load availability.',
        );
    }
    try {
      setJoined(await participationClient.joined(eventId, userId));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not load your registration.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [eventId, userId, revision]);

  async function change() {
    if (joined && !window.confirm('Leave this event? Its places may fill up.'))
      return;
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
      <h2 className="text-lg">Registration</h2>
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
                loading ||
                Boolean(error) ||
                (!joined &&
                  (availability.status !== 'OPEN' ||
                    availability.available === 0))
              }
              variant={joined ? 'outline' : 'default'}
              loading={busy}
            >
              {joined ? 'Leave event' : 'Join event'}
            </Button>
          )}
        </>
      ) : loading ? (
        <LoadingRegion label="Loading registration" className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-10 w-28" />
        </LoadingRegion>
      ) : (
        <p className="text-sm text-neutral-600">
          Registration has not opened yet.
        </p>
      )}
      {notice && <InlineFeedback message={notice} tone="success" />}
      {error && <InlineFeedback message={error} tone="error" />}
    </div>
  );
}
