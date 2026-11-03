'use client';

import { useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/contexts/ToastContext';

export function EventChatSettings({
  event,
  onChanged,
}: {
  event: EventDetail;
  onChanged: (event: EventDetail) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  async function change(chatEnabled: boolean) {
    setBusy(true);
    try {
      onChanged(await eventsClient.updateChatSetting(event.id, chatEnabled));
      show(
        chatEnabled ? 'Event chats enabled.' : 'Event chats disabled.',
        'success',
      );
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not change event chats.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Chat settings</h2>
      <div className="flex items-center justify-between gap-3 text-sm">
        <label htmlFor="event-chat-toggle" className="mb-0">
          Enable event chats for participants
        </label>
        <Switch
          id="event-chat-toggle"
          checked={event.chatEnabled}
          disabled={busy || Boolean(event.pendingStatus)}
          onCheckedChange={(value) => void change(value)}
        />
      </div>
      <p className="text-sm text-neutral-600">
        Disabling chats hides the rooms and keeps their history for later.
      </p>
    </section>
  );
}
