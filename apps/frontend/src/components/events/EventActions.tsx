'use client';

import { useState } from 'react';
import type { EventDetail, UserRole } from '@event-sharing/contracts';
import { eventsClient, type EventAction } from '@/lib/api/EventsClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/feedback/Notice';

const transitions: Record<
  string,
  { label: string; action: EventAction; admin?: boolean; reason?: boolean }[]
> = {
  DRAFT: [
    { label: 'Submit for review', action: 'submit' },
    { label: 'Cancel event', action: 'cancel', reason: true },
  ],
  MODERATION: [
    { label: 'Approve', action: 'approve', admin: true },
    { label: 'Reject', action: 'reject', admin: true, reason: true },
    { label: 'Cancel event', action: 'cancel', reason: true },
  ],
  REJECTED: [
    { label: 'Resubmit', action: 'submit' },
    { label: 'Archive', action: 'archive' },
  ],
  APPROVED: [
    { label: 'Publish', action: 'publish' },
    { label: 'Cancel event', action: 'cancel', reason: true },
  ],
  PUBLISHED: [
    { label: 'Start event', action: 'start' },
    { label: 'Complete event', action: 'complete' },
    { label: 'Cancel event', action: 'cancel', reason: true },
  ],
  ONGOING: [
    { label: 'Complete event', action: 'complete' },
    { label: 'Cancel event', action: 'cancel', reason: true },
  ],
  COMPLETED: [{ label: 'Archive', action: 'archive' }],
  CANCELLED: [{ label: 'Archive', action: 'archive' }],
};

export function EventActions({
  event,
  role,
  onChanged,
}: {
  event: EventDetail;
  role: UserRole;
  onChanged: (event: EventDetail) => void;
}) {
  const [reason, setReason] = useState('');
  const [selected, setSelected] = useState<EventAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const available = [
    ...(transitions[event.status] ?? []),
    ...(['PUBLISHED', 'ONGOING'].includes(event.status) &&
    event.endTime > new Date().toISOString()
      ? [
          {
            label:
              event.registrationStatus === 'OPEN'
                ? 'Close registration'
                : 'Open registration',
            action: (event.registrationStatus === 'OPEN'
              ? 'registration/close'
              : 'registration/open') as EventAction,
          },
        ]
      : []),
  ].filter((item) => {
    if (item.admin && role !== 'ADMIN') return false;
    if (item.action === 'start' || item.action === 'complete') {
      return event.startTime <= new Date().toISOString();
    }
    return true;
  });

  async function run(action: EventAction, requiresReason?: boolean) {
    if (requiresReason && selected !== action) {
      setSelected(action);
      setError('');
      return;
    }
    if (requiresReason && !reason.trim()) {
      setError('A reason is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      onChanged(
        await eventsClient.action(
          event.id,
          action,
          requiresReason ? { reason: reason.trim() } : {},
        ),
      );
      setSelected(null);
      setReason('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update event.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!available.length) return null;
  return (
    <div className="space-y-5">
      <h3>Manage event</h3>
      {event.pendingStatus && (
        <Notice
          message={`Processing ${event.pendingStatus.replaceAll('_', ' ').toLowerCase()}. This page will update when the policy is confirmed.`}
          tone="warning"
        />
      )}
      {event.policyError && <Notice message={event.policyError} tone="error" />}
      <div className="flex flex-wrap gap-2">
        {available.map((item) => (
          <Button
            key={item.action}
            variant={
              item.action === 'cancel' || item.action === 'reject'
                ? 'outline'
                : 'default'
            }
            disabled={busy || Boolean(event.pendingStatus)}
            onClick={() => void run(item.action, item.reason)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {selected && (
        <div className="max-w-lg space-y-3">
          <label htmlFor="reason">Reason</label>
          <Input
            id="reason"
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain this decision"
          />
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => void run(selected, true)}>
              Confirm
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setReason('');
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
