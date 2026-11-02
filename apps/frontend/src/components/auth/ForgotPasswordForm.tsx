'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '@/lib/api/AuthClient';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    authClient
      .accountCapabilities()
      .then((value) => setAvailable(value.emailDeliveryAvailable))
      .catch(() => setAvailable(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await authClient.requestPasswordReset(
        email.trim(),
        `${window.location.origin}/reset-password`,
      );
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not request a reset link.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 py-10">
      <h1>Reset your password</h1>
      <p className="text-neutral-600">
        Enter your account email. If it exists, we will send a one-time reset
        link.
      </p>
      <form
        onSubmit={submit}
        className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
      >
        <div>
          <label htmlFor="reset-email">Email</label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={!available || busy || sent}
          />
        </div>
        {!available && (
          <Notice
            message="Password reset email is unavailable until mail delivery is configured."
            tone="warning"
          />
        )}
        {sent && (
          <Notice
            message="If this account exists, check your email for the reset link."
            tone="success"
          />
        )}
        {error && <Notice message={error} tone="error" />}
        <Button disabled={!available || busy || sent}>
          {busy ? 'Sending…' : 'Send reset link'}
        </Button>
      </form>
      <Link href="/sign-in" className="text-sm font-semibold underline">
        Back to sign in
      </Link>
    </div>
  );
}
