'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';
import {
  needsUsernameSelection,
  type SearchMode,
} from '@event-sharing/contracts';
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

  if (
    !user ||
    needsUsernameSelection(user.username) ||
    !ready ||
    mode !== 'UNSET'
  )
    return null;

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
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        {/* This choice is required, so the dialog cannot be dismissed. */}
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-5 overflow-y-auto overscroll-contain rounded-xl bg-white p-7 shadow-xl focus:outline-none"
        >
          <Dialog.Title asChild>
            <h2>How would you like to find events?</h2>
          </Dialog.Title>
          <Dialog.Description className="text-sm leading-6 text-neutral-700">
            We can search near your current position, around a place you choose,
            from a map point, or anywhere. Your exact position is used for the
            current search and is not saved in your profile or search history.
            You can change this choice in Profile settings. The map provider
            receives requests for the area you view, and Photon receives place
            searches for suggestions.
          </Dialog.Description>
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
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
