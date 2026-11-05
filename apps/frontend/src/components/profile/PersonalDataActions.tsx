'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { gateway } from '@/lib/api/GatewayClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';

type ExportStatus = {
  status: 'NONE' | 'PROCESSING' | 'READY';
  id?: string;
  completed?: number;
  total?: number;
};

export function PersonalDataActions() {
  const [job, setJob] = useState<ExportStatus>({ status: 'NONE' });
  const [busy, setBusy] = useState(false);
  const { show } = useToast();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await gateway.get<ExportStatus>('/auth/privacy/exports');
        if (!active) return;
        setJob(next);
        if (next.status === 'PROCESSING')
          timer = setTimeout(() => void refresh(), 5000);
      } catch {
        if (active) show('Could not check export status.', 'error');
      }
    };
    void refresh();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job.status]);

  async function prepare() {
    setBusy(true);
    try {
      await gateway.post('/auth/privacy/exports');
      setJob({ status: 'PROCESSING' });
      show(
        'Your export is being prepared. You can leave this page.',
        'success',
      );
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : 'Could not prepare the export.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount() {
    if (
      !window.confirm(
        'Delete your account? Your sessions will end and this cannot be undone. Chat text and shared event history remain without your name. Cancel active events first.',
      )
    )
      return;
    setBusy(true);
    try {
      const request = await gateway.post<{ receipt: string }>(
        '/auth/privacy/deletion-request',
      );
      localStorage.setItem('event-sharing-deletion-receipt', request.receipt);
      router.push('/account-deletion');
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : 'Could not start account deletion.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Your data</h2>
      <p className="text-sm text-neutral-600">
        Prepare a private JSON export of your account and data from every
        service. Preparation continues in the background. The download expires
        after 24 hours.
      </p>
      {job.status === 'READY' && job.id ? (
        <a
          className="inline-flex rounded-md border px-4 py-2 text-sm font-medium"
          href={`/backend/auth/privacy/exports/${job.id}/file`}
        >
          Download my data
        </a>
      ) : (
        <Button
          variant="outline"
          disabled={busy || job.status === 'PROCESSING'}
          onClick={() => void prepare()}
        >
          {job.status === 'PROCESSING'
            ? `Preparing export (${job.completed ?? 0}/${job.total ?? 9})`
            : 'Prepare data export'}
        </Button>
      )}
      <div className="space-y-3 border-t pt-5">
        <h3>Account deletion</h3>
        <p className="text-sm text-neutral-600">
          Cancel active events before continuing. Deletion automatically removes
          your account and personal records across services. Shared chat text
          remains with an anonymous author. Events with other participants
          remain in their history.
        </p>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void removeAccount()}
        >
          Delete my account
        </Button>
      </div>
    </section>
  );
}
