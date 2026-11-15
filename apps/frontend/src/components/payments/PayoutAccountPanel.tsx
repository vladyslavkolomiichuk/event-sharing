'use client';

import { useEffect, useState } from 'react';
import type { PayoutAccount } from '@event-sharing/contracts';
import { paymentsClient } from '@/lib/api/PaymentsClient';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { LoadingRegion } from '@/components/feedback/Skeletons';

export function PayoutAccountPanel() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    paymentsClient
      .account()
      .then(setAccount)
      .catch((cause: unknown) =>
        setError(
          cause instanceof Error ? cause.message : 'Could not load payouts.',
        ),
      );
  }, []);

  async function connect() {
    setBusy(true);
    setError('');
    try {
      const { url } = await paymentsClient.onboarding();
      window.location.assign(url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not open Stripe.',
      );
      setBusy(false);
    }
  }

  if (!account && !error)
    return (
      <LoadingRegion label="Loading payouts" className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-10 w-40" />
      </LoadingRegion>
    );

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7">
      {account && !account.available && (
        <InlineFeedback
          tone="warning"
          message="Online payments are not enabled on this site yet."
        />
      )}
      {account?.available && account.chargesEnabled && (
        <InlineFeedback
          tone="success"
          message="Your payout account is ready. You can sell tickets."
        />
      )}
      {account?.available && !account.chargesEnabled && (
        <>
          <p className="text-sm text-neutral-600">
            {account.connected
              ? 'Stripe still needs some details before you can accept payments.'
              : 'You have not connected a payout account yet.'}
          </p>
          <Button onClick={() => void connect()} loading={busy}>
            {account.connected ? 'Continue Stripe setup' : 'Connect Stripe'}
          </Button>
        </>
      )}
      {account?.available && account.chargesEnabled && (
        <Button variant="outline" onClick={() => void connect()} loading={busy}>
          Update payout details
        </Button>
      )}
      {error && <InlineFeedback message={error} tone="error" />}
    </section>
  );
}
