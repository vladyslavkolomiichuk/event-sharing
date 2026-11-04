import type { SearchEvent } from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';
import { ExploreEventItem } from './ExploreEventItem';

export function ExploreResultsPanel({
  items,
  selectedId,
  selectedRegion,
  loading,
  error,
  cursor,
  onSelect,
  onRoute,
  onLoadMore,
  onRetry,
  needsLocation,
  grid = false,
}: {
  items: SearchEvent[];
  selectedId: string | null;
  selectedRegion: string | null;
  loading: boolean;
  error: string;
  cursor: string | null;
  onSelect: (item: SearchEvent) => void;
  onRoute: (id: string) => void;
  onLoadMore: (cursor: string) => void;
  onRetry: () => void;
  needsLocation: boolean;
  grid?: boolean;
}) {
  return (
    <section
      aria-label="Search results"
      className="flex h-full min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-base font-semibold">Events</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{items.length} shown</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && !loading && (
          <div className="mb-3 space-y-2">
            <InlineFeedback message={error} tone="error" />
            <Button type="button" size="sm" variant="outline" onClick={onRetry}>
              Retry search
            </Button>
          </div>
        )}
        {loading && !items.length ? (
          <Loading label="Searching events…" />
        ) : items.length ? (
          <div
            className={`grid gap-2 ${grid ? 'sm:grid-cols-2 2xl:grid-cols-3' : ''}`}
          >
            {items.map((item) => (
              <ExploreEventItem
                key={item.id}
                event={item}
                selected={
                  selectedId === item.id ||
                  Boolean(
                    selectedRegion && selectedRegion === item.location.region,
                  )
                }
                onSelect={() => onSelect(item)}
                onRoute={() => onRoute(item.id)}
              />
            ))}
          </div>
        ) : (
          <p className="p-4 text-sm text-neutral-600">
            {needsLocation
              ? 'Choose a location or clear it to search everywhere.'
              : error
                ? 'Results are unavailable right now.'
                : 'No events match these filters. Try a wider area or another date.'}
          </p>
        )}
        {cursor && !error && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 w-full"
            disabled={loading}
            onClick={() => onLoadMore(cursor)}
          >
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </div>
    </section>
  );
}
