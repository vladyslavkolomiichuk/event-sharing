'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AuthForm({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'sign-up')
        await authClient.signUp(name.trim(), email.trim(), password);
      else await authClient.signIn(email.trim(), password);
      await refresh();
      router.push('/events');
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
