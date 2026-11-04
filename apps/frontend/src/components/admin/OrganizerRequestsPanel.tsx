'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { AdminOrganizerRequest } from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function OrganizerRequestsPanel({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const { show } = useToast();
  const [requests, setRequests] = useState<AdminOrganizerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [decisionReason, setDecisionReason] = useState('');

  const refresh = useCallback(async () => {
    try {
      const page = await authClient.pendingOrganizerRequests();
      setRequests(page.requests);
      onCountChange?.(page.total);
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not load role requests.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }, [show, onCountChange]);

  useEffect(() => {
    void refresh();
    const changed = () => void refresh();
    window.addEventListener('notifications:remote', changed);
    return () => window.removeEventListener('notifications:remote', changed);
  }, [refresh]);

  useEffect(() => {
    const targetId = window.location.hash.slice(1);
    if (!targetId.startsWith('organizer-request-')) return;
    document.getElementById(targetId)?.scrollIntoView({ block: 'center' });
  }, [requests]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    if (busyId) return;
    setBusyId(id);
    try {
      await authClient.decideOrganizerRequest(
        id,
        decision,
        decision === 'reject' ? decisionReason.trim() : undefined,
      );
      setRejectId(null);
      setDecisionReason('');
      show(
        `Organizer request ${decision === 'approve' ? 'approved' : 'declined'}.`,
        'success',
      );
      await refresh();
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not decide request.',
        'error',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      id="organizer-requests"
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7 lg:col-span-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2>Organizer requests</h2>
          <p className="text-sm text-neutral-600">
            Review account requests before granting event creation access.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
        >
          Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-neutral-600">Loading requests…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-neutral-600">No pending requests.</p>
      ) : (
        <div className="space-y-4">
          {requests.map((request) => (
            <article
              key={request.id}
              id={`organizer-request-${request.id}`}
              className="space-y-3 rounded-lg border border-neutral-200 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/u/${request.requester.username}`}
                  className="font-semibold underline focus-visible:outline-2 focus-visible:outline-black"
                >
                  {request.requester.name} @{request.requester.username}
                </Link>
                <span className="text-xs text-neutral-500">
                  {new Date(request.requestedAt).toLocaleString('en-US')}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-neutral-700">
                {request.reason}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={Boolean(busyId)}
                  onClick={() => void decide(request.id, 'approve')}
                >
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={Boolean(busyId)}
                  onClick={() => {
                    setRejectId(request.id);
                    setDecisionReason('');
                  }}
                >
                  Decline
                </Button>
              </div>
              {rejectId === request.id && (
                <div className="space-y-3">
                  <label htmlFor={`role-decision-${request.id}`}>
                    Reason for declining
                  </label>
                  <Textarea
                    id={`role-decision-${request.id}`}
                    minLength={10}
                    maxLength={1000}
                    required
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      Boolean(busyId) || decisionReason.trim().length < 10
                    }
                    onClick={() => void decide(request.id, 'reject')}
                  >
                    Confirm decline
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
