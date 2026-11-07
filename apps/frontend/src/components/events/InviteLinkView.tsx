'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { invitationClient } from '@/lib/api/InvitationClient';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/feedback/Skeletons';
import { Notice } from '@/components/feedback/Notice';

export function InviteLinkView({ token }: { token: string }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [preview, setPreview] = useState<{
    eventId: string;
    title: string;
    expiresAt: string;
  } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    void invitationClient
      .previewLink(token)
      .then(setPreview)
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : 'This invitation is unavailable.',
        ),
      );
  }, [token, user, authLoading]);

  async function accept() {
    setBusy(true);
    try {
      await invitationClient.acceptLink(token);
      router.push(`/events/${preview?.eventId}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not accept invitation.',
      );
      setBusy(false);
    }
  }

  if (authLoading)
    return <CardSkeleton label="Checking invitation" className="max-w-xl" />;
  if (!user)
    return (
      <div className="space-y-4">
        <h1>Sign in to open this invitation</h1>
        <Button asChild>
          <Link
            href={`/sign-in?returnTo=${encodeURIComponent(`/invite/${token}`)}`}
          >
            Sign in
          </Link>
        </Button>
      </div>
    );
  if (error)
    return (
      <div className="space-y-4">
        <h1>Invitation unavailable</h1>
        <Notice message={error} tone="error" />
      </div>
    );
  if (!preview)
    return <CardSkeleton label="Checking invitation" className="max-w-xl" />;
  return (
    <section className="max-w-xl space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
      <h1>{preview.title}</h1>
      <p>
        This private invitation expires{' '}
        {new Date(preview.expiresAt).toLocaleString('en-US')}.
      </p>
      <Button onClick={() => void accept()} loading={busy}>
        Accept invitation
      </Button>
    </section>
  );
}
