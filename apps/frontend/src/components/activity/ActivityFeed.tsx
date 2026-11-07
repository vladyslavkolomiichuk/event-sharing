import { RowsSkeleton } from '@/components/feedback/Skeletons';
import Link from 'next/link';
import type {
  EventLogEntry,
  UserProfilePublic,
} from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';
import { UserProfileLink } from '@/components/profile/UserProfileLink';
import { formatDateTime } from '@/lib/format-date';

export function ActivityFeed({
  items,
  profiles,
  nextCursor,
  loading,
  failed,
  onLoadMore,
}: {
  items: EventLogEntry[];
  profiles: Record<string, UserProfilePublic>;
  nextCursor: string | null;
  loading: boolean;
  failed: boolean;
  onLoadMore: () => void;
}) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-xl font-semibold">Event history</h2>
        {!(loading && !items.length) && (
          <span className="text-xs text-neutral-500">{items.length} shown</span>
        )}
      </div>
      <div className="max-h-[680px] divide-y divide-neutral-200 overflow-y-auto">
        {items.map((item) => (
          <article key={item.id} className="space-y-2 py-4 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-base font-semibold capitalize">
                {item.summary}
              </h3>
              <time
                dateTime={item.occurredAt}
                className="text-xs text-neutral-600"
              >
                {formatDateTime(item.occurredAt)}
              </time>
            </div>
            <p className="text-xs text-neutral-500">
              {item.producer}, {item.eventType}
            </p>
            {Object.keys(item.details).length > 0 && (
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
                {Object.entries(item.details).map(([key, value]) => (
                  <div key={key} className="flex gap-1">
                    <dt>{key}:</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {(item.subjectUserId || item.relatedEventId) && (
              <div className="flex gap-4 text-xs font-semibold underline">
                {item.subjectUserId && (
                  <UserProfileLink
                    userId={item.subjectUserId}
                    profile={profiles[item.subjectUserId] ?? null}
                  />
                )}
                {item.relatedEventId && (
                  <Link href={`/events/${item.relatedEventId}`}>
                    Open event
                  </Link>
                )}
              </div>
            )}
          </article>
        ))}
        {!items.length && loading && (
          <RowsSkeleton label="Loading event history" rows={5} />
        )}
        {!items.length && !loading && (
          <p className="py-8 text-sm text-neutral-600">
            {failed
              ? 'Event history is unavailable. Refresh to try again.'
              : 'No events match these filters.'}
          </p>
        )}
      </div>
      {nextCursor && (
        <Button
          type="button"
          variant="outline"
          className="mt-4 w-full"
          onClick={onLoadMore}
          loading={loading}
        >
          Load more
        </Button>
      )}
    </section>
  );
}
