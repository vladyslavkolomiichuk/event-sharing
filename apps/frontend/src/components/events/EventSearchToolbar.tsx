import type { EventSearchQuery } from '@event-sharing/contracts';
import type { Category } from '@/lib/api/EventsClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EventSearchToolbar({
  text,
  onTextChange,
  categories,
  categoryId,
  onCategoryChange,
  sort,
  onSortChange,
  canSortByDistance,
  canSortByRelevance,
  onUseLocation,
}: {
  text: string;
  onTextChange: (value: string) => void;
  categories: Category[];
  categoryId: string;
  onCategoryChange: (value: string) => void;
  sort: EventSearchQuery['sort'];
  onSortChange: (value: EventSearchQuery['sort']) => void;
  canSortByDistance: boolean;
  canSortByRelevance: boolean;
  onUseLocation: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label htmlFor="event-search-text">Search events</label>
        <Input
          id="event-search-text"
          value={text}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Title, description, city, category"
          maxLength={200}
        />
      </div>
      <div>
        <label htmlFor="event-search-category">Category</label>
        <select
          id="event-search-category"
          className="w-full"
          value={categoryId}
          onChange={(event) => onCategoryChange(event.target.value)}
        >
          <option value="">All categories</option>
          <option value="uncategorized">Uncategorized</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="event-search-sort">Sort by</label>
        <select
          id="event-search-sort"
          className="w-full"
          value={sort}
          onChange={(event) =>
            onSortChange(event.target.value as EventSearchQuery['sort'])
          }
        >
          <option value="start_time">Soonest</option>
          {canSortByDistance && <option value="distance">Nearest</option>}
          {canSortByRelevance && <option value="relevance">Relevance</option>}
        </select>
      </div>
      <Button
        type="button"
        variant="outline"
        className="col-span-2"
        onClick={onUseLocation}
      >
        Use my location
      </Button>
    </div>
  );
}
