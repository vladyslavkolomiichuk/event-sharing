'use client';

import { useEffect, useState } from 'react';
import { authClient, type SocialProvider } from '@/lib/api/AuthClient';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';

const providers: SocialProvider[] = ['google', 'github'];

export function SocialAccounts() {
  const { show } = useToast();
  const [available, setAvailable] = useState<Record<SocialProvider, boolean>>({
    google: false,
    github: false,
  });
  const [connected, setConnected] = useState<SocialProvider[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([
      authClient.accountCapabilities(),
      authClient.socialAccounts(),
    ])
      .then(([capabilities, accounts]) => {
        setAvailable(capabilities.socialProviders);
        setConnected(accounts.providers);
      })
      .catch(() => show('Could not load connected accounts.', 'error'));
    if (new URLSearchParams(window.location.search).has('error')) {
      show(
        'The provider could not be connected. Check that its email matches this account and it is not linked elsewhere.',
        'error',
      );
    }
  }, []);

  async function connect(provider: SocialProvider) {
    setBusy(true);
    try {
      const callback = `${window.location.origin}/profile`;
      const errorCallback = `${callback}?error=oauth_link_failed`;
      window.location.assign(
        await authClient.startSocial(provider, callback, errorCallback, true),
      );
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not connect this provider.',
        'error',
      );
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Connected sign-in methods</h2>
      <p className="text-sm text-neutral-600">
        Sign in first, then connect another provider to this account. The
        provider email must match your account email.
      </p>
      {providers.map((provider) => (
        <div
          key={provider}
          className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-3"
        >
          <span>{provider === 'google' ? 'Google' : 'GitHub'}</span>
          {connected.includes(provider) ? (
            <span className="text-sm text-green-700">Connected</span>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy || !available[provider]}
              onClick={() => void connect(provider)}
            >
              {available[provider] ? 'Connect' : 'Unavailable'}
            </Button>
          )}
        </div>
      ))}
    </section>
  );
}
