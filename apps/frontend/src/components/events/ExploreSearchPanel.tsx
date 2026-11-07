'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useEffect, useRef, useState } from 'react';
import type { EventSearchQuery } from '@event-sharing/contracts';
import type { Category } from '@/lib/api/EventsClient';
import type { MapPoint } from '@/components/map/MapView';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExploreView } from './ExploreViewSwitch';
import { OrganizerFilter } from './OrganizerFilter';

type Panel = 'search' | 'location' | 'filters' | 'sort';
export type ExploreSearchProps = {
  view: ExploreView;
  text: string;
  onTextChange: (value: string) => void;
  categories: Category[];
  categoryId: string;
  onCategoryChange: (value: string) => void;
  organizerId: string;
  organizerQuery: string;
  onOrganizerQueryChange: (value: string) => void;
  onOrganizerSelect: (id: string, label: string) => void;
  sort: EventSearchQuery['sort'];
  onSortChange: (value: EventSearchQuery['sort']) => void;
  canSortByDistance: boolean;
  canSortByRelevance: boolean;
  placeQuery: string;
  onPlaceQueryChange: (value: string) => void;
  placeKind: 'city' | 'address';
  onPlaceKindChange: (value: 'city' | 'address') => void;
  onPlaceSelect: (point: MapPoint, label: string) => void;
  locationActive: boolean;
  canClearLocation: boolean;
  locationLabel: string;
  radiusKm: number;
  onRadiusChange: (value: number) => void;
  startFrom: string;
  onStartFromChange: (value: string) => void;
  startTo: string;
  onStartToChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onClearFilters: () => void;
  onClearLocation: () => void;
  onUseLocation: () => void;
  onPickMap: () => void;
};

export function ExploreSearchPanel(props: ExploreSearchProps) {
  const { view } = props;
  const [open, setOpen] = useState<Panel | null>(null);
  const [width, setWidth] = useState(800);
  const root = useRef<HTMLDivElement>(null);
  const filterCount = [
    props.categoryId,
    props.organizerId,
    props.startFrom,
    props.startTo,
    props.status,
  ].filter(Boolean).length;
  const canClearFilters = Boolean(
    props.text || filterCount || props.sort !== 'start_time',
  );

  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(root.current);
    return () => observer.disconnect();
  }, [view]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        width >= 450 &&
        root.current &&
        !root.current.contains(event.target as Node)
      )
        setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open, width]);
  useEffect(() => setOpen(null), [view]);

  const close = () => setOpen(null);
  const search = (
    <div>
      <label htmlFor="explore-text">Search events</label>
      <Input
        id="explore-text"
        type="search"
        value={props.text}
        onChange={(event) => props.onTextChange(event.target.value)}
        placeholder="Title, description, city, category"
        maxLength={200}
      />
    </div>
  );
  const category = (
    <div>
      <label htmlFor="explore-category">Category</label>
      <select
        id="explore-category"
        className="w-full"
        value={props.categoryId}
        onChange={(event) => {
          props.onCategoryChange(event.target.value);
        }}
      >
        <option value="">All categories</option>
        <option value="uncategorized">Uncategorized</option>
        {props.categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
  const sort = (
    <div>
      <label htmlFor="explore-sort">Sort by</label>
      <select
        id="explore-sort"
        className="w-full"
        value={props.sort}
        onChange={(event) => {
          props.onSortChange(event.target.value as EventSearchQuery['sort']);
        }}
      >
        <option value="start_time">Soonest</option>
        {props.canSortByDistance && <option value="distance">Nearest</option>}
        {props.canSortByRelevance && (
          <option value="relevance">Relevance</option>
        )}
      </select>
    </div>
  );
  const organizer = (
    <OrganizerFilter
      query={props.organizerQuery}
      selectedId={props.organizerId}
      onQueryChange={props.onOrganizerQueryChange}
      onSelect={props.onOrganizerSelect}
    />
  );
  const dates = (
    <>
      <div>
        <label htmlFor="explore-from">From</label>
        <Input
          id="explore-from"
          type="date"
          value={props.startFrom}
          max={props.startTo || undefined}
          onChange={(event) => props.onStartFromChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="explore-to">Until</label>
        <Input
          id="explore-to"
          type="date"
          value={props.startTo}
          min={props.startFrom || undefined}
          onChange={(event) => props.onStartToChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="explore-status">Status</label>
        <select
          id="explore-status"
          className="w-full"
          value={props.status}
          onChange={(event) => {
            props.onStatusChange(event.target.value);
          }}
        >
          <option value="">All active</option>
          <option value="PUBLISHED">Published</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
    </>
  );
  const location = (
    <>
      <div>
        <label htmlFor="explore-place-kind">Find by</label>
        <select
          id="explore-place-kind"
          className="w-full"
          value={props.placeKind}
          onChange={(event) =>
            props.onPlaceKindChange(event.target.value as 'city' | 'address')
          }
        >
          <option value="city">City</option>
          <option value="address">Address</option>
        </select>
      </div>
      <div className="min-w-0">
        <PlaceAutocomplete
          id="explore-place"
          label={props.placeKind === 'city' ? 'City' : 'Address'}
          kind={props.placeKind}
          value={props.placeQuery}
          onChange={props.onPlaceQueryChange}
          onSelect={(place) => {
            props.onPlaceSelect(
              { latitude: place.latitude, longitude: place.longitude },
              place.label,
            );
            close();
          }}
          placeholder={
            props.placeKind === 'city' ? 'Choose a city' : 'Choose an address'
          }
        />
      </div>
      <div>
        <label htmlFor="explore-radius">Radius</label>
        <select
          id="explore-radius"
          className="w-full"
          value={props.radiusKm}
          disabled={!props.locationActive}
          onChange={(event) => {
            props.onRadiusChange(Number(event.target.value));
          }}
        >
          {[5, 15, 30, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value} km
            </option>
          ))}
        </select>
      </div>
    </>
  );
  const locationActions = (
    <div className="flex flex-wrap items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          props.onUseLocation();
          close();
        }}
      >
        Use my location
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          props.onPickMap();
          close();
        }}
      >
        Pick on map
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={!props.canClearLocation}
        onClick={() => {
          props.onClearLocation();
          close();
        }}
      >
        Clear location
      </Button>
    </div>
  );
  const locationInfo = (
    <p className="text-xs text-neutral-600">
      {props.locationLabel}
      {props.locationActive ? ` · ${props.radiusKm} km` : ''}. Hidden venues use
      approximate positions. Device location is used only for the current
      search. Place suggestions use Photon.
    </p>
  );
  const filters = (
    <div className="space-y-3">
      {organizer}
      <div className="grid grid-cols-2 gap-3">
        {category}
        {dates}
      </div>
      {canClearFilters && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={props.onClearFilters}
        >
          Clear search filters
        </Button>
      )}
    </div>
  );
  const locationPanel = (
    <div className="space-y-3">
      <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
        {location}
      </div>
      {locationActions}
      {locationInfo}
    </div>
  );
  const panelContent =
    open === 'search' ? (
      search
    ) : open === 'location' ? (
      locationPanel
    ) : open === 'sort' ? (
      sort
    ) : (
      <div className="space-y-4">
        {filters}
        {width < 450 && (
          <>
            {locationPanel}
            {sort}
          </>
        )}
      </div>
    );

  if (view === 'list' && width >= 750)
    return (
      <div
        ref={root}
        className="space-y-2 rounded-lg border border-neutral-200 bg-white p-3"
      >
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(180px,2fr)_minmax(130px,1fr)_minmax(150px,1fr)_repeat(2,minmax(125px,1fr))_minmax(120px,1fr)_minmax(110px,1fr)]">
          {search}
          {category}
          {organizer}
          {dates}
          {sort}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[100px_minmax(190px,2fr)_100px_auto] xl:items-end">
          {location}
          {locationActions}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {locationInfo}
          {canClearFilters && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={props.onClearFilters}
            >
              Clear search filters
            </Button>
          )}
        </div>
      </div>
    );

  const button = (panel: Panel, label: string) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-expanded={open === panel}
      onClick={() => setOpen(open === panel ? null : panel)}
    >
      {label}
    </Button>
  );
  return (
    <div ref={root} className="relative w-full">
      <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white p-2 shadow-sm">
        {width >= 750 ? (
          <Input
            aria-label="Search events"
            type="search"
            value={props.text}
            onChange={(event) => props.onTextChange(event.target.value)}
            placeholder="Search events…"
            maxLength={200}
            className="min-w-0 flex-1"
          />
        ) : (
          button('search', props.text ? 'Search •' : 'Search')
        )}
        {width >= 450 &&
          button('location', props.locationActive ? 'Location •' : 'Location')}
        {button(
          'filters',
          filterCount ? `Filters (${filterCount})` : 'Filters',
        )}
        {width >= 450 && button('sort', 'Sort')}
      </div>
      {width >= 450 && open && (
        <div className="absolute left-0 top-full z-30 mt-2 max-h-[min(70dvh,600px)] w-[min(420px,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-xl">
          {panelContent}
        </div>
      )}
      {width < 450 && (
        <Dialog.Root
          open={Boolean(open)}
          onOpenChange={(value) => {
            if (!value) close();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[80dvh] overflow-y-auto overscroll-contain rounded-t-xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl">
              <Dialog.Title className="mb-4 text-lg font-semibold">
                {open === 'search' ? 'Search events' : 'Search filters'}
              </Dialog.Title>
              <Dialog.Description className="sr-only">
                Choose search options and close this panel to return to results.
              </Dialog.Description>
              {panelContent}
              <Dialog.Close asChild>
                <Button type="button" variant="outline" className="mt-4 w-full">
                  Done
                </Button>
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </div>
  );
}
