'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  CreateSystemMessageSchema,
  type CreateSystemMessage,
  type SystemMessage,
} from '@event-sharing/contracts';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export function SystemMessagesPanel() {
  const { show } = useToast();
  const [items, setItems] = useState<SystemMessage[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] =
    useState<CreateSystemMessage['audience']>('ALL');
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);
  const load = useCallback(
    async (next?: string) => {
      const current = ++requestId.current;
      try {
        const page = await notificationsClient.systemMessages(next);
        if (current !== requestId.current) return;
        setItems((previous) =>
          next ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } catch (cause) {
        if (current !== requestId.current) return;
        show(
          cause instanceof Error
            ? cause.message
            : 'Could not load system messages.',
          'error',
        );
      }
    },
    [show],
  );
  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener('notifications:remote', refresh);
    return () => {
      requestId.current++;
      window.removeEventListener('notifications:remote', refresh);
    };
  }, [load]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await notificationsClient.createSystemMessage(
        CreateSystemMessageSchema.parse({ title, body, audience }),
      );
      setTitle('');
      setBody('');
      show('System message published.', 'success');
      await load();
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not publish system message.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      await notificationsClient.removeSystemMessage(id);
      setItems((current) => current.filter((item) => item.id !== id));
      show('System message removed.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not remove system message.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      id="system-messages"
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7 lg:col-span-2"
    >
      <h2>System messages</h2>
      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        <div>
          <label htmlFor="system-title">Title</label>
          <Input
            id="system-title"
            minLength={3}
            maxLength={120}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="system-body">Message</label>
          <Textarea
            id="system-body"
            maxLength={2000}
            required
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="system-audience">Audience</label>
          <select
            id="system-audience"
            value={audience}
            onChange={(event) =>
              setAudience(event.target.value as CreateSystemMessage['audience'])
            }
          >
            <option value="ALL">Everyone</option>
            <option value="ORGANIZER">Organizers</option>
            <option value="ADMIN">Administrators</option>
          </select>
        </div>
        <Button disabled={busy}>{busy ? 'Saving…' : 'Publish message'}</Button>
      </form>
      <div className="space-y-3">
        {items.map((item) => (
          <article
            key={item.id}
            className="space-y-2 rounded-lg border border-neutral-200 p-4"
          >
            <h3>{item.title}</h3>
            <p className="whitespace-pre-wrap text-sm">{item.body}</p>
            <p className="text-xs text-neutral-500">
              {item.audience} ·{' '}
              {new Date(item.createdAt).toLocaleString('en-US')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void remove(item.id)}
            >
              Remove
            </Button>
          </article>
        ))}
        {cursor && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void load(cursor)}
          >
            Load more
          </Button>
        )}
      </div>
    </section>
  );
}
