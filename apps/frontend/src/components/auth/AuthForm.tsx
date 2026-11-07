'use client';

import { LoadingRegion } from '@/components/feedback/Skeletons';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ChosenUsernameSchema,
  DisplayNameSchema,
} from '@event-sharing/contracts';
import { authClient, type SocialProvider } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
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
  const [socialStatus, setSocialStatus] = useState<
    'loading' | 'ready' | 'error'
  >('loading');

  useEffect(() => {
    void authClient
      .accountCapabilities()
      .then((value) => {
        setSocial(value.socialProviders);
        setSocialStatus('ready');
      })
      .catch(() => setSocialStatus('error'));
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
        if (!available.available) {
          setAvailability('Username is already taken.');
          return;
        }
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
        <p className="text-sm font-medium text-neutral-500">Your account</p>
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
                validate={(value) =>
                  DisplayNameSchema.safeParse(value).success
                    ? ''
                    : 'Use letters, numbers, spaces, apostrophes, periods, or hyphens.'
                }
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
                validate={(value) => {
                  const parsed = ChosenUsernameSchema.safeParse(value);
                  if (!parsed.success)
                    return (
                      parsed.error.issues[0]?.message ?? 'Invalid username.'
                    );
                  return availability === 'Username is already taken.'
                    ? availability
                    : '';
                }}
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
                <p
                  className={`mt-2 text-xs ${availability === 'Username is already taken.' ? 'text-red-700' : 'text-neutral-600'}`}
                  aria-live="polite"
                >
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
        {error && <InlineFeedback message={error} tone="error" />}
        <Button className="w-full" loading={busy}>
          {mode === 'sign-in' ? 'Sign in' : 'Create account'}
        </Button>
      </form>
      <div className="mt-5 space-y-3 rounded-xl border border-neutral-200 bg-white p-7">
        <p className="text-sm text-neutral-600">Sign in or create an account</p>
        {socialStatus === 'loading' ? (
          <LoadingRegion label="Checking social sign-in" className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </LoadingRegion>
        ) : (
          (['google', 'github'] as const).map((provider) => (
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
          ))
        )}
        {socialStatus === 'error' && (
          <InlineFeedback
            message="Could not check social sign-in availability. Reload the page to try again."
            tone="error"
          />
        )}
        {socialStatus === 'ready' && !social.google && !social.github && (
          <InlineFeedback
            message="Social sign-in is unavailable right now. You can use email and password."
            tone="warning"
          />
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
