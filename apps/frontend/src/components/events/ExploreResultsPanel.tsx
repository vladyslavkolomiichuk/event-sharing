import type { SearchEvent } from '@event-sharing/contracts';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
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
  onClose,
  needsLocation,
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
  onClose?: () => void;
  needsLocation: boolean;
}) {
  return (
    <section
      aria-label="Search results"
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white/95 shadow-lg backdrop-blur-sm"
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="text-base font-semibold">Events</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-500">{items.length} shown</span>
          {onClose && (
            <button
              type="button"
              className="text-xs font-semibold underline lg:hidden"
              onClick={onClose}
            >
              Hide
            </button>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {loading && !items.length ? (
          <Loading label="Searching events…" />
        ) : items.length ? (
          items.map((item) => (
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
          ))
        ) : (
          <p className="p-4 text-sm text-neutral-600">
            {needsLocation
              ? 'Choose a location or clear it to search everywhere.'
              : error
                ? 'Search is temporarily unavailable.'
                : 'No events match these filters. Try a wider area or another date.'}
          </p>
        )}
        {cursor && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
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
