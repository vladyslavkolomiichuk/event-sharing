'use client';

import { useState } from 'react';
import type { SearchMode } from '@event-sharing/contracts';
import { useSearchPreference } from '@/contexts/SearchPreferenceContext';
import { Button } from '@/components/ui/button';
import { useToast } from '@/contexts/ToastContext';

export function SearchPreferenceSettings() {
  const { show } = useToast();
  const { mode, ready, permission, chooseMode, requestPosition } =
    useSearchPreference();
  const [busy, setBusy] = useState(false);

  async function save(next: SearchMode) {
    setBusy(true);
    try {
      if (next === 'DEVICE' && permission === 'unsupported') {
        throw new Error('Location requires HTTPS or localhost.');
      }
      await chooseMode(next);
      if (next === 'DEVICE') await requestPosition();
      show('Search method updated.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not update search method.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Event search location</h2>
      <p className="text-sm text-neutral-600">
        Choose the default way to find events. Exact device coordinates are used
        only for a search and are never saved here.
      </p>
      <div>
        <label htmlFor="search-mode">Search method</label>
        <select
          id="search-mode"
          className="w-full"
          value={mode}
          disabled={!ready || busy}
          onChange={(event) => void save(event.target.value as SearchMode)}
        >
          <option value="UNSET" disabled>
            Choose a method
          </option>
          <option value="DEVICE">Current location</option>
          <option value="CITY">City</option>
          <option value="ADDRESS">Address</option>
          <option value="MAP">Map point</option>
          <option value="ANYWHERE">Anywhere</option>
        </select>
      </div>
      <p className="text-xs text-neutral-500">
        Browser location permission: {permission}.
        {permission === 'denied' &&
          ' Allow location in your browser settings to use it again.'}
      </p>
      {mode === 'DEVICE' && permission !== 'granted' && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || permission === 'unsupported'}
          onClick={() => void save('DEVICE')}
        >
          Try current location
        </Button>
      )}
    </section>
  );
}
