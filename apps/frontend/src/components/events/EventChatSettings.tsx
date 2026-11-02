'use client';

import { useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { Notice } from '@/components/feedback/Notice';

export function EventChatSettings({
  event,
  onChanged,
}: {
  event: EventDetail;
  onChanged: (event: EventDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function change(chatEnabled: boolean) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      onChanged(await eventsClient.updateChatSetting(event.id, chatEnabled));
      setNotice(chatEnabled ? 'Event chats enabled.' : 'Event chats disabled.');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not change event chats.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Chat settings</h2>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={event.chatEnabled}
          disabled={busy || Boolean(event.pendingStatus)}
          onChange={(changeEvent) => void change(changeEvent.target.checked)}
        />
        Enable event chats for participants
      </label>
      <p className="text-sm text-neutral-600">
        Disabling chats hides the rooms and keeps their history for later.
      </p>
      {error && <Notice message={error} tone="error" />}
      {notice && <Notice message={notice} tone="success" />}
    </section>
  );
}
