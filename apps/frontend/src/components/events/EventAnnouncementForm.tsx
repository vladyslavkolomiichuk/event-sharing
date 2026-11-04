'use client';

import { useState, type FormEvent } from 'react';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Notice } from '@/components/feedback/Notice';

export function EventAnnouncementForm({ eventId }: { eventId: string }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const result = await notificationsClient.sendEvent(eventId, body.trim());
      setBody('');
      setSuccess(
        `Announcement delivered to ${result.recipientCount} participants.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not send announcement.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Announcement to participants</h2>
      <p className="text-sm text-neutral-600">
        This is a one-way notification. Participants cannot reply to it.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label htmlFor="announcement">Announcement</label>
        <Textarea
          id="announcement"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={2000}
          required
          validate={(value) => (value.trim() ? '' : 'Enter an announcement.')}
          rows={4}
        />
        <Button disabled={busy || !body.trim()}>
          {busy ? 'Sending…' : 'Send announcement'}
        </Button>
      </form>
      {error && <Notice message={error} tone="error" />}
      {success && <Notice message={success} tone="success" />}
    </section>
  );
}
