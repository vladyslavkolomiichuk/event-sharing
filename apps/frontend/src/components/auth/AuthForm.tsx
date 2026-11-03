'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { ChosenUsernameSchema } from '@event-sharing/contracts';
import { authClient, type SocialProvider } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UsernameSuggestions } from './UsernameSuggestions';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [availability, setAvailability] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [social, setSocial] = useState<Record<SocialProvider, boolean>>({
    google: false,
    github: false,
  });

  useEffect(() => {
    void authClient
      .accountCapabilities()
      .then((value) => setSocial(value.socialProviders))
      .catch(() => undefined);
    const oauthError = new URLSearchParams(window.location.search).get('error');
    if (oauthError) {
      setError(
        oauthError.includes('account_not_linked') ||
          oauthError.includes('account not linked')
          ? 'An account with this email already exists. Sign in with its original method, then connect this provider in Profile.'
          : 'Social sign-in could not be completed. Please try again.',
      );
    }
  }, []);

  useEffect(() => {
    if (mode !== 'sign-up' || !username.trim()) {
      setAvailability('');
      return;
    }
    const parsed = ChosenUsernameSchema.safeParse(username);
    if (!parsed.success) {
      setAvailability(parsed.error.issues[0]?.message ?? 'Invalid username.');
      return;
    }
    let active = true;
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
  }, [mode, username]);

  async function startSocial(provider: SocialProvider) {
    setBusy(true);
    setError('');
    try {
      const returnTo = new URLSearchParams(window.location.search).get(
        'returnTo',
      );
      const destination =
        returnTo?.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/events';
      const callback = `${window.location.origin}${destination}`;
      const errorCallback = `${window.location.origin}/sign-in?error=oauth_failed`;
      window.location.assign(
        await authClient.startSocial(provider, callback, errorCallback),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start social sign-in.',
      );
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'sign-up') {
        const chosen = ChosenUsernameSchema.parse(username);
        const available = await authClient.usernameAvailable(chosen);
        if (!available.available) throw new Error('Username is already taken.');
        await authClient.signUp(name.trim(), chosen, email.trim(), password);
      } else await authClient.signIn(email.trim(), password);
      await refresh();
      const returnTo = new URLSearchParams(window.location.search).get(
        'returnTo',
      );
      router.push(
        returnTo?.startsWith('/') && !returnTo.startsWith('//')
          ? returnTo
          : '/events',
      );
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Authentication failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="mb-10 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Your account
        </p>
        <h1>{mode === 'sign-in' ? 'Welcome back.' : 'Create your account.'}</h1>
        <p className="text-neutral-600">
          {mode === 'sign-in'
            ? 'Sign in to manage your events and registrations.'
            : 'Join events or start organizing your own.'}
        </p>
      </div>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
      >
        {mode === 'sign-up' && (
          <>
            <div>
              <label htmlFor="name">Name</label>
              <Input
                id="name"
                autoComplete="name"
                required
                minLength={2}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="signup-username">Username</label>
              <Input
                id="signup-username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={30}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="alex_2026"
                aria-describedby="signup-username-help"
              />
              <p
                id="signup-username-help"
                className="mt-2 text-xs text-neutral-600"
              >
                Choose 3–30 letters, numbers, or underscores. Start with a
                letter.
              </p>
              <UsernameSuggestions name={name} onChoose={setUsername} />
              {availability && (
                <p className="mt-2 text-xs" aria-live="polite">
                  {availability}
                </p>
              )}
            </div>
          </>
        )}
        <div>
          <label htmlFor="email">Email</label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="password">Password</label>
          <Input
            id="password"
            type="password"
            autoComplete={
              mode === 'sign-in' ? 'current-password' : 'new-password'
            }
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {mode === 'sign-in' && (
            <Link
              href="/forgot-password"
              className="mt-2 inline-block text-sm underline"
            >
              Forgot password?
            </Link>
          )}
        </div>
        {error && <Notice message={error} tone="error" />}
        <Button className="w-full" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'sign-in'
              ? 'Sign in'
              : 'Create account'}
        </Button>
      </form>
      <div className="mt-5 space-y-3 rounded-xl border border-neutral-200 bg-white p-7">
        <p className="text-sm text-neutral-600">Sign in or create an account</p>
        {(['google', 'github'] as const).map((provider) => (
          <Button
            key={provider}
            type="button"
            variant="outline"
            className="w-full"
            disabled={busy || !social[provider]}
            onClick={() => void startSocial(provider)}
          >
            Continue with {provider === 'google' ? 'Google' : 'GitHub'}
          </Button>
        ))}
        {!social.google && !social.github && (
          <p className="text-xs text-neutral-500">
            Social sign-in is awaiting provider configuration.
          </p>
        )}
      </div>
      <p className="mt-5 text-sm text-neutral-600">
        {mode === 'sign-in' ? 'New here?' : 'Already have an account?'}{' '}
        <Link
          className="font-semibold text-black underline"
          href={mode === 'sign-in' ? '/sign-up' : '/sign-in'}
        >
          {mode === 'sign-in' ? 'Create an account' : 'Sign in'}
        </Link>
      </p>
    </div>
  );
}
