'use client';

import { useState } from 'react';
import type { EventDetail, UserRole } from '@event-sharing/contracts';
import { eventsClient, type EventAction } from '@/lib/api/EventsClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

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
  const [reasonAttempted, setReasonAttempted] = useState(false);
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
    if (action === 'archive' && !window.confirm('Archive this event?')) return;
    if (requiresReason && selected !== action) {
      setSelected(action);
      setReasonAttempted(false);
      setError('');
      return;
    }
    if (requiresReason && !reason.trim()) {
      setReasonAttempted(true);
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
      setReasonAttempted(false);
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
      <h2>Manage event</h2>
      {event.pendingStatus && (
        <InlineFeedback
          message="This change is being applied. The page updates when it finishes."
          tone="warning"
        />
      )}
      {event.policyError && (
        <InlineFeedback message={event.policyError} tone="error" />
      )}
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
            required
            forceValidation={reasonAttempted}
            validate={(value) => (value.trim() ? '' : 'Enter a reason.')}
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
                setReasonAttempted(false);
              }}
            >
              Back
            </Button>
          </div>
        </div>
      )}
      {error && <InlineFeedback message={error} tone="error" />}
    </div>
  );
}
