'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { authClient } from '@/lib/api/AuthClient';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ResetPasswordForm({
  token,
  errorCode,
}: {
  token?: string;
  errorCode?: string;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!token) return;
    setBusy(true);
    try {
      await authClient.resetPassword(token, password);
      setDone(true);
      setPassword('');
      setConfirmation('');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not reset password.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <h1>Choose a new password</h1>
      {!token && (
        <Notice
          message={
            errorCode
              ? 'This reset link is invalid or expired.'
              : 'Open the reset link from your email.'
          }
          tone="error"
        />
      )}
      {token && !done && (
        <form
          onSubmit={submit}
          className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
        >
          <div>
            <label htmlFor="reset-password">New password</label>
            <Input
              id="reset-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="reset-confirmation">Confirm new password</label>
            <Input
              id="reset-confirmation"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </div>
          {error && <Notice message={error} tone="error" />}
          <Button disabled={busy}>{busy ? 'Saving…' : 'Reset password'}</Button>
        </form>
      )}
      {done && (
        <Notice
          message="Password reset. Sign in with your new password."
          tone="success"
        />
      )}
      <Link href="/sign-in" className="text-sm font-semibold underline">
        Sign in
      </Link>
    </div>
  );
}
