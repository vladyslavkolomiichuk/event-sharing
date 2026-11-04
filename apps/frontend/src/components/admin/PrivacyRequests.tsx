'use client';

import { useEffect, useState } from 'react';
import { authClient } from '@/lib/api/AuthClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';

type PrivacyRequest = Awaited<
  ReturnType<typeof authClient.pendingDeletionRequests>
>['requests'][number];

export function PrivacyRequests() {
  const { show } = useToast();
  const [requests, setRequests] = useState<PrivacyRequest[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setRequests((await authClient.pendingDeletionRequests()).requests);
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not load requests.',
        'error',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section
      id="privacy-requests"
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <h2>Account deletion requests</h2>
        <Button
          variant="outline"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>
      <p className="text-sm text-neutral-600">
        Review requests and coordinate data removal or anonymization across
        services.
      </p>
      {requests.length === 0 ? (
        <p className="text-sm text-neutral-600">No pending requests.</p>
      ) : (
        <ul className="divide-y divide-neutral-200">
          {requests.map((request) => (
            <li key={request.id} className="py-3 text-sm">
              <strong>{request.user.name}</strong> (@{request.user.username})
              <span className="block">{request.user.email}</span>
              <span className="text-neutral-500">
                Requested{' '}
                {new Date(request.requestedAt).toLocaleDateString('en-US')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
