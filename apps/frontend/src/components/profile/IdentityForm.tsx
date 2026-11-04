'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  UpdateIdentitySchema,
  ChosenUsernameSchema,
  DisplayNameSchema,
} from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

export function IdentityForm() {
  const { user, refresh } = useAuth();
  const { show } = useToast();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [availability, setAvailability] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    setName(user?.name ?? '');
    setUsername(user?.username ?? '');
  }, [user?.id, user?.name, user?.username]);

  useEffect(() => {
    if (!username.trim() || username === user?.username) {
      setAvailability('');
      return;
    }
    const parsed = ChosenUsernameSchema.safeParse(username);
    if (!parsed.success) {
      setAvailability('');
      return;
    }
    let active = true;
    setAvailability('Checking availability…');
    const timer = window.setTimeout(() => {
      void authClient.usernameAvailable(parsed.data).then(
        (result) => {
          if (active)
            setAvailability(
              result.available
                ? 'Username is available.'
                : 'Username is already taken.',
            );
        },
        () => {
          if (active) setAvailability('Availability could not be checked.');
        },
      );
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [username, user?.username]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const input = UpdateIdentitySchema.safeParse({ name, username });
      if (!input.success) {
        setFormError(
          input.error.issues[0]?.message ?? 'Invalid identity details.',
        );
        return;
      }
      if (availability === 'Username is already taken.') return;
      const updated = await authClient.updateIdentity(input.data);
      setName(updated.name);
      setUsername(updated.username);
      await refresh();
      show('Name and username updated.', 'success');
    } catch (cause) {
      setFormError(
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
          validate={(value) =>
            DisplayNameSchema.safeParse(value).success
              ? ''
              : 'Use letters, numbers, spaces, apostrophes, periods, or hyphens.'
          }
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
          onChange={(event) => {
            setUsername(event.target.value);
            setAvailability('');
          }}
          validate={(value) => {
            const parsed = ChosenUsernameSchema.safeParse(value);
            if (!parsed.success)
              return parsed.error.issues[0]?.message ?? 'Invalid username.';
            return availability === 'Username is already taken.'
              ? availability
              : '';
          }}
        />
        <p className="mt-2 text-xs text-neutral-500">
          Use 3–30 lowercase letters, numbers, or underscores. Start with a
          letter.
        </p>
        {availability && (
          <p
            className={`mt-2 text-sm ${availability === 'Username is already taken.' ? 'text-red-700' : 'text-neutral-600'}`}
            aria-live="polite"
          >
            {availability}
          </p>
        )}
      </div>
      {formError && <InlineFeedback message={formError} tone="error" />}
      <Button disabled={busy}>{busy ? 'Saving…' : 'Save identity'}</Button>
    </form>
  );
}
