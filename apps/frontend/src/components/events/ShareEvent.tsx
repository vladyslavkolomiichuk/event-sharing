'use client';

import { useEffect, useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { invitationClient, type InviteLink } from '@/lib/api/InvitationClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

export function ShareEvent({
  event,
  isOwner,
}: {
  event: EventDetail;
  isOwner: boolean;
}) {
  const [links, setLinks] = useState<InviteLink[]>([]);
  const [createdUrl, setCreatedUrl] = useState('');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<
    'success' | 'warning' | 'error'
  >('success');
  const [linksError, setLinksError] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [maxUsesAttempted, setMaxUsesAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOwner && event.visibility === 'INVITE_ONLY') {
      void invitationClient
        .links(event.id)
        .then((value) => {
          setLinks(value);
          setLinksError('');
        })
        .catch(() =>
          setLinksError(
            'Could not load invitation links. Reload the page to try again.',
          ),
        );
    }
  }, [event.id, event.visibility, isOwner]);

  async function share(url: string) {
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied.');
        setMessageTone('success');
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setMessage(
        cause instanceof Error ? cause.message : 'Could not share the link.',
      );
      setMessageTone('error');
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
      setMessageTone('success');
    } catch {
      setMessage('Could not copy the link.');
      setMessageTone('error');
    }
  }

  async function create() {
    const count = Number(maxUses);
    if (maxUses && (!/^\d+$/.test(maxUses) || count < 1 || count > 1000)) {
      setMaxUsesAttempted(true);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const expiration = new Date(
        Math.min(Date.now() + 7 * 24 * 60 * 60_000, Date.parse(event.endTime)),
      );
      const link = await invitationClient.createLink(
        event.id,
        expiration.toISOString(),
        maxUses ? Number(maxUses) : null,
      );
      const url = `${window.location.origin}/invite/${link.token}`;
      setCreatedUrl(url);
      try {
        setLinks(await invitationClient.links(event.id));
        setLinksError('');
      } catch {
        setLinksError('Could not refresh the invitation link list.');
      }
      setMessage(
        'Private invitation link created. Copy it now; the token is shown once.',
      );
      setMessageTone('success');
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Could not create invitation link.',
      );
      setMessageTone('error');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!window.confirm('Revoke this invitation link? It will stop working.'))
      return;
    try {
      await invitationClient.revokeLink(event.id, id);
      setLinks(await invitationClient.links(event.id));
      setCreatedUrl('');
      setMessage('Invitation link revoked.');
      setMessageTone('success');
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not revoke the link.',
      );
      setMessageTone('error');
    }
  }

  if (event.visibility === 'INVITE_ONLY' && !isOwner) return null;
  if (
    !['PUBLISHED', 'ONGOING'].includes(event.status) ||
    new Date(event.endTime) <= new Date()
  )
    return null;
  const url =
    typeof window === 'undefined'
      ? ''
      : `${window.location.origin}/events/${event.id}`;
  return (
    <section className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5">
      <h2>Share event</h2>
      {event.visibility === 'INVITE_ONLY' ? (
        <>
          <p className="text-sm text-neutral-600">
            Private links grant invitation access until they expire or are
            revoked.
          </p>
          <label htmlFor="max-link-uses">Maximum uses (optional)</label>
          <Input
            id="max-link-uses"
            className="w-28"
            type="text"
            inputMode="numeric"
            forceValidation={maxUsesAttempted}
            validate={(value) =>
              value &&
              (!/^\d+$/.test(value) ||
                Number(value) < 1 ||
                Number(value) > 1000)
                ? 'Enter a whole number from 1 to 1000.'
                : ''
            }
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
          />
          <Button disabled={busy} onClick={() => void create()}>
            Create invitation link
          </Button>
          {createdUrl && (
            <div className="flex flex-wrap gap-2">
              <input
                className="min-w-0 flex-1 rounded-md border p-2"
                readOnly
                value={createdUrl}
                aria-label="New invitation link"
              />
              <Button variant="outline" onClick={() => void copy(createdUrl)}>
                Copy
              </Button>
              <Button variant="outline" onClick={() => void share(createdUrl)}>
                Share
              </Button>
            </div>
          )}
          <ul className="space-y-2">
            {links.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center gap-3 text-sm"
              >
                <span>
                  {link.revokedAt
                    ? 'Revoked'
                    : new Date(link.expiresAt) <= new Date()
                      ? 'Expired'
                      : 'Active'}{' '}
                  · {link.uses ?? 0}
                  {link.maxUses === null ? '' : ` / ${link.maxUses}`} uses ·
                  Expires {new Date(link.expiresAt).toLocaleDateString('en-US')}
                </span>
                {!link.revokedAt && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void revoke(link.id)}
                  >
                    Revoke
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {linksError && <InlineFeedback message={linksError} tone="warning" />}
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void share(url)}>Share event</Button>
          <Button variant="outline" onClick={() => void copy(url)}>
            Copy link
          </Button>
        </div>
      )}
      {message && <InlineFeedback message={message} tone={messageTone} />}
    </section>
  );
}
