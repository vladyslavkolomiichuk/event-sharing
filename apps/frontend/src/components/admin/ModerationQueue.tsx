'use client';

import { RowsSkeleton } from '@/components/feedback/Skeletons';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { EventDetail, UserProfilePublic } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { useToast } from '@/contexts/ToastContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ModerationQueue({
  onCountChange,
}: {
  onCountChange?: (count: number) => void;
}) {
  const { show } = useToast();
  const [events, setEvents] = useState<EventDetail[]>([]);
  const [organizers, setOrganizers] = useState<
    Record<string, UserProfilePublic>
  >({});
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const requestId = useRef(0);

  const load = useCallback(
    async (cursor?: string, append = false) => {
      const currentRequest = ++requestId.current;
      setLoading(true);
      try {
        const page = await eventsClient.moderation(cursor);
        const people = await usersClient
          .getMany(page.items.map((event) => event.organizerId))
          .catch(() => []);
        if (requestId.current !== currentRequest) return;
        setEvents((current) =>
          append ? [...current, ...page.items] : page.items,
        );
        setOrganizers((current) => ({
          ...(append ? current : {}),
          ...Object.fromEntries(
            people.map((person) => [person.userId, person]),
          ),
        }));
        setTotal(page.total);
        onCountChange?.(page.total);
        setNextCursor(page.nextCursor);
      } catch (cause) {
        if (requestId.current !== currentRequest) return;
        show(
          cause instanceof Error
            ? cause.message
            : 'Could not load moderation queue.',
          'error',
        );
      } finally {
        if (requestId.current === currentRequest) setLoading(false);
      }
    },
    [show, onCountChange],
  );

  useEffect(() => {
    void load();
    const changed = () => void load();
    window.addEventListener('notifications:remote', changed);
    return () => {
      requestId.current++;
      window.removeEventListener('notifications:remote', changed);
    };
  }, [load]);

  async function decide(id: string, action: 'approve' | 'reject') {
    if (busyId) return;
    setBusyId(id);
    try {
      await eventsClient.action(
        id,
        action,
        action === 'reject' ? { reason: reason.trim() } : {},
      );
      setRejectId(null);
      setReason('');
      show(
        `Event ${action === 'approve' ? 'approved' : 'declined'}.`,
        'success',
      );
      await load();
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not review event.',
        'error',
      );
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      id="moderation-queue"
      className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7 lg:col-span-2"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2">
            Event moderation <Badge>{total}</Badge>
          </h2>
          <p className="text-sm text-neutral-600">
            Review submitted events before publication.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </div>
      {loading && events.length === 0 ? (
        <RowsSkeleton label="Loading queue" rows={3} action />
      ) : events.length === 0 ? (
        <p className="text-sm text-neutral-600">No events awaiting review.</p>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const organizer = organizers[event.organizerId];
            return (
              <article
                key={event.id}
                className="space-y-3 rounded-lg border border-neutral-200 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/events/${event.id}`}
                      className="font-semibold underline focus-visible:outline-2 focus-visible:outline-black"
                    >
                      {event.title}
                    </Link>
                    <p className="text-sm text-neutral-600">
                      {event.categoryName ?? 'Uncategorized'} ·{' '}
                      {new Intl.DateTimeFormat('en-US', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                        timeZone: event.timeZone,
                      }).format(new Date(event.startTime))}
                    </p>
                  </div>
                  <Badge>Pending review</Badge>
                </div>
                {organizer ? (
                  <Link
                    href={`/u/${organizer.username}`}
                    className="text-sm underline"
                  >
                    {organizer.name} @{organizer.username}
                  </Link>
                ) : (
                  <p className="text-sm text-neutral-500">
                    Organizer profile unavailable
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    disabled={Boolean(busyId)}
                    onClick={() => void decide(event.id, 'approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(busyId)}
                    onClick={() => {
                      setRejectId(event.id);
                      setReason('');
                    }}
                  >
                    Decline
                  </Button>
                </div>
                {rejectId === event.id && (
                  <div className="space-y-3">
                    <label htmlFor={`moderation-reason-${event.id}`}>
                      Reason for declining
                    </label>
                    <Textarea
                      id={`moderation-reason-${event.id}`}
                      required
                      maxLength={1000}
                      validate={(value) =>
                        value.trim() ? '' : 'Enter a reason for declining.'
                      }
                      value={reason}
                      onChange={(change) => setReason(change.target.value)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={Boolean(busyId) || !reason.trim()}
                      onClick={() => void decide(event.id, 'reject')}
                    >
                      Confirm decline
                    </Button>
                  </div>
                )}
              </article>
            );
          })}
          {nextCursor && (
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => void load(nextCursor, true)}
            >
              Load more
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
