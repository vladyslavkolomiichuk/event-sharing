'use client';

import { useEffect, useState } from 'react';
import type { EventDetail } from '@event-sharing/contracts';
import { invitationClient, type InviteLink } from '@/lib/api/InvitationClient';
import { Button } from '@/components/ui/button';
import { Notice } from '@/components/feedback/Notice';

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
  const [maxUses, setMaxUses] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isOwner && event.visibility === 'INVITE_ONLY') {
      void invitationClient
        .links(event.id)
        .then(setLinks)
        .catch(() => setLinks([]));
    }
  }, [event.id, event.visibility, isOwner]);

  async function share(url: string) {
    try {
      if (navigator.share) await navigator.share({ title: event.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied.');
      }
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setMessage(
        cause instanceof Error ? cause.message : 'Could not share the link.',
      );
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('Link copied.');
    } catch {
      setMessage('Could not copy the link.');
    }
  }

  async function create() {
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
      setLinks(await invitationClient.links(event.id));
      setMessage(
        'Private invitation link created. Copy it now; the token is shown once.',
      );
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : 'Could not create invitation link.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await invitationClient.revokeLink(event.id, id);
      setLinks(await invitationClient.links(event.id));
      setCreatedUrl('');
      setMessage('Invitation link revoked.');
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : 'Could not revoke the link.',
      );
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
          <input
            id="max-link-uses"
            className="w-28 rounded-md border border-neutral-300 p-2"
            type="number"
            min={1}
            max={1000}
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
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void share(url)}>Share event</Button>
          <Button variant="outline" onClick={() => void copy(url)}>
            Copy link
          </Button>
        </div>
      )}
      {message && (
        <Notice
          message={message}
          tone={message.includes('Could not') ? 'error' : 'success'}
        />
      )}
    </section>
  );
}
