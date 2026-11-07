'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ChosenUsernameSchema } from '@event-sharing/contracts';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UsernameSuggestions } from './UsernameSuggestions';

export function UsernameOnboarding() {
  const { user, refresh, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!username.trim()) {
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
  }, [username]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const chosen = ChosenUsernameSchema.parse(username);
      const result = await authClient.usernameAvailable(chosen);
      if (!result.available) {
        setAvailability('Username is already taken.');
        return;
      }
      await authClient.updateIdentity({ username: chosen });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save username.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mx-auto max-w-lg space-y-6 py-10">
      <div className="space-y-3">
        <p className="text-sm font-medium text-neutral-500">
          Complete your account
        </p>
        <h1>Choose a username</h1>
        <p className="text-sm leading-6 text-neutral-600">
          Your username is how others find and mention you. You can change it
          later. Your sign-in and existing account links stay the same.
        </p>
      </div>
      <form
        onSubmit={(event) => void submit(event)}
        className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
      >
        <div>
          <label htmlFor="onboarding-username">Username</label>
          <Input
            id="onboarding-username"
            autoComplete="username"
            required
            minLength={3}
            maxLength={30}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            validate={(value) => {
              const parsed = ChosenUsernameSchema.safeParse(value);
              if (!parsed.success)
                return parsed.error.issues[0]?.message ?? 'Invalid username.';
              return availability === 'Username is already taken.'
                ? availability
                : '';
            }}
            placeholder="alex_2026"
            aria-describedby="onboarding-username-help"
          />
          <p
            id="onboarding-username-help"
            className="mt-2 text-xs text-neutral-600"
          >
            Use 3–30 letters, numbers, or underscores, starting with a letter.
          </p>
          <UsernameSuggestions name={user?.name ?? ''} onChoose={setUsername} />
          {availability && (
            <p
              className={`mt-2 text-xs ${availability === 'Username is already taken.' ? 'text-red-700' : 'text-neutral-600'}`}
              aria-live="polite"
            >
              {availability}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button className="w-full" loading={busy}>
          Continue
        </Button>
      </form>
      <Button variant="ghost" onClick={() => void signOut()}>
        Sign out
      </Button>
    </section>
  );
}
