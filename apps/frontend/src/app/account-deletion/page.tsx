'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { gateway } from '@/lib/api/GatewayClient';
import { Button } from '@/components/ui/button';

type Status = {
  status: string;
  progress: { completed: number; total: number };
  errorCode: string | null;
};

export default function AccountDeletionPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      const receipt = localStorage.getItem('event-sharing-deletion-receipt');
      if (!receipt) {
        setError('No deletion receipt is stored in this browser.');
        return;
      }
      try {
        const result = await gateway.request<Status>(
          '/auth/privacy/deletion-status',
          { headers: { 'x-privacy-receipt': receipt } },
        );
        if (!active) return;
        setStatus(result);
        setError('');
        if (!['COMPLETED', 'REJECTED'].includes(result.status))
          timer = setTimeout(() => void refresh(), 5000);
      } catch {
        if (active)
          setError(
            'Status is temporarily unavailable. Your request remains saved.',
          );
      }
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [retry]);
  return (
    <section className="mx-auto max-w-xl space-y-5 rounded-xl border bg-white p-7">
      <h1>Account deletion</h1>
      {status?.status === 'COMPLETED' ? (
        <p>
          Your account deletion is complete. Shared chat text and event history
          remain without your profile. Retained backups and Kafka records expire
          under the privacy policy.
        </p>
      ) : status?.status === 'REJECTED' ? (
        <p>
          Cancel your active events before requesting deletion again. Your
          account remains available.
        </p>
      ) : (
        <p>
          Your request is processed automatically. Sessions end before deletion
          starts; this includes a short wait for previously issued access tokens
          to expire. You can return to this page in the same browser to check
          progress.
        </p>
      )}
      {status && (
        <p role="status">
          Completed steps: {status.progress.completed} / {status.progress.total}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
        Check status
      </Button>
      <p>
        <Link className="underline" href="/">
          Return home
        </Link>
      </p>
    </section>
  );
}
