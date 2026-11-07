'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useState, type FormEvent } from 'react';
import type { OrganizerRequest } from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function OrganizerRoleRequestDialog() {
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState<OrganizerRequest | null>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function openDialog(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      setRequest((await authClient.organizerRequest()).request);
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not load your request.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void openDialog(true);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const submitted = await authClient.submitOrganizerRequest(reason.trim());
      setRequest(submitted);
      setReason('');
      show('Organizer request submitted.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not submit the request.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(next) => void openDialog(next)}>
      <Dialog.Trigger asChild>
        <Button>Request organizer access</Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-5 rounded-xl bg-white p-6 shadow-xl focus:outline-none">
          <Dialog.Title className="text-xl font-semibold">
            Organizer access
          </Dialog.Title>
          <Dialog.Description className="text-sm text-neutral-600">
            Tell the moderators why you want to organize events.
          </Dialog.Description>
          {loading ? (
            <p className="text-sm text-neutral-600">Loading request…</p>
          ) : request?.status === 'PENDING' ? (
            <p className="text-sm text-neutral-700">
              Your request is pending review. You will receive a notification
              when an administrator decides.
            </p>
          ) : request?.status === 'APPROVED' ? (
            <p className="text-sm text-neutral-700">
              Access was approved. Refresh your account to create an event.
            </p>
          ) : (
            <form
              onSubmit={(event) => void submit(event)}
              className="space-y-4"
            >
              {request?.status === 'REJECTED' && (
                <p className="text-sm text-red-700">
                  Previous request declined: {request.decisionReason}
                </p>
              )}
              <div>
                <label htmlFor="organizer-reason">Reason</label>
                <Textarea
                  id="organizer-reason"
                  required
                  minLength={20}
                  maxLength={1000}
                  validate={(value) =>
                    value.trim().length < 20
                      ? 'Describe your plans in at least 20 characters.'
                      : ''
                  }
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Describe the events you plan to organize"
                />
              </div>
              <Button loading={busy}>Submit request</Button>
            </form>
          )}
          <Dialog.Close asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
