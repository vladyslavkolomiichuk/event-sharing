'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { UpdateIdentitySchema } from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/feedback/Notice';

export function IdentityForm() {
  const { user, refresh } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setUsername(user?.username ?? '');
  }, [user?.id, user?.name, user?.username]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaved(false);
    setBusy(true);
    try {
      const input = UpdateIdentitySchema.safeParse({ name, username });
      if (!input.success) {
        setError(input.error.issues[0]?.message ?? 'Invalid identity details.');
        return;
      }
      const updated = await authClient.updateIdentity(input.data);
      setName(updated.name);
      setUsername(updated.username);
      await refresh();
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not update identity.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
    >
      <h2>Name and username</h2>
      <div>
        <label htmlFor="display-name">Display name</label>
        <Input
          id="display-name"
          autoComplete="name"
          minLength={2}
          maxLength={80}
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="username">Username</label>
        <Input
          id="username"
          autoComplete="username"
          minLength={3}
          maxLength={30}
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Use 3–30 lowercase letters, numbers, or underscores. Start with a
          letter.
        </p>
      </div>
      {saved && <Notice message="Name and username updated." tone="success" />}
      {error && <Notice message={error} tone="error" />}
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save identity'}</Button>
    </form>
  );
}
