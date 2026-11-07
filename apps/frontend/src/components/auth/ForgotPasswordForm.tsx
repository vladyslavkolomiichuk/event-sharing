'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { authClient } from '@/lib/api/AuthClient';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [capability, setCapability] = useState<
    'loading' | 'available' | 'unavailable' | 'error'
  >('loading');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    authClient
      .accountCapabilities()
      .then((value) =>
        setCapability(
          value.emailDeliveryAvailable ? 'available' : 'unavailable',
        ),
      )
      .catch(() => setCapability('error'));
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
            disabled={capability !== 'available' || busy || sent}
          />
        </div>
        {capability === 'loading' && (
          <InlineFeedback message="Checking email availability…" />
        )}
        {capability === 'unavailable' && (
          <InlineFeedback
            message="Password reset email is unavailable right now. Please try again later."
            tone="warning"
          />
        )}
        {capability === 'error' && (
          <InlineFeedback
            message="Could not check email availability. Reload the page to try again."
            tone="error"
          />
        )}
        {sent && (
          <InlineFeedback
            message="If this account exists, check your email for the reset link."
            tone="success"
          />
        )}
        {error && <InlineFeedback message={error} tone="error" />}
        <Button
          disabled={capability !== 'available' || busy || sent}
          loading={busy}
        >
          Send reset link
        </Button>
      </form>
      <Link href="/sign-in" className="text-sm font-semibold underline">
        Back to sign in
      </Link>
    </div>
  );
}
