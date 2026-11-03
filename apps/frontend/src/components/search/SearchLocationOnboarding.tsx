'use client';

import { useState } from 'react';
import type { SearchMode } from '@event-sharing/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchPreference } from '@/contexts/SearchPreferenceContext';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';

export function SearchLocationOnboarding() {
  const { user } = useAuth();
  const { mode, ready, permission, chooseMode, requestPosition } =
    useSearchPreference();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!user || !ready || mode !== 'UNSET') return null;

  async function choose(next: SearchMode) {
    setBusy(true);
    setError('');
    try {
      if (next === 'DEVICE' && permission === 'unsupported') {
        throw new Error('Location requires HTTPS or localhost.');
      }
      if (next === 'DEVICE') await requestPosition();
      await chooseMode(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not save search method.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="search-location-title"
        className="w-full max-w-lg space-y-5 rounded-xl bg-white p-7 shadow-xl"
      >
        <h2 id="search-location-title">How would you like to find events?</h2>
        <p className="text-sm leading-6 text-neutral-700">
          We can search near your current position, around a place you choose,
          from a map point, or anywhere. Your exact position is used for the
          current search and is not saved in your profile or search history. You
          can change this choice in Profile settings. The map provider receives
          requests for the area you view, and Photon receives place searches for
          suggestions.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void choose('DEVICE')}>
            Use my location
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void choose('CITY')}
          >
            Choose a city
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void choose('ADDRESS')}
          >
            Enter an address
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void choose('MAP')}
          >
            Pick on map
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void choose('ANYWHERE')}
          >
            Explore anywhere
          </Button>
        </div>
        {error && <Notice message={error} tone="error" />}
      </section>
    </div>
  );
}
