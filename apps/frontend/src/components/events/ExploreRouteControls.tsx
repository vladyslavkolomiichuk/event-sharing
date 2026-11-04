'use client';

import type { EventRouteResponse, TravelMode } from '@event-sharing/contracts';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import type { MapPoint } from '@/components/map/MapView';
import { Button } from '@/components/ui/button';

export function ExploreRouteControls({
  eventTitle,
  origin,
  originLabel,
  onOriginLabelChange,
  onOriginChange,
  mode,
  onModeChange,
  onUseLocation,
  onUseSearchCenter,
  onPickOnMap,
  onBuild,
  onClear,
  route,
  loading,
}: {
  eventTitle: string | null;
  origin: MapPoint | null;
  originLabel: string;
  onOriginLabelChange: (value: string) => void;
  onOriginChange: (point: MapPoint, label: string) => void;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onUseLocation: () => void;
  onUseSearchCenter?: () => void;
  onPickOnMap: () => void;
  onBuild: () => void;
  onClear: () => void;
  route: EventRouteResponse | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-3 border-t border-neutral-200 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Destination: {eventTitle ?? 'Choose an event from the list or map'}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear route
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(180px,1fr)_auto_auto_auto_130px_auto] lg:items-end">
        <div className="col-span-2 min-w-0 lg:col-span-1">
          <PlaceAutocomplete
            id="explore-route-origin"
            label="Starting address or city"
            kind="address"
            value={
              originLabel === 'Map point' ||
              originLabel === 'Current location' ||
              originLabel === 'Search center'
                ? ''
                : originLabel
            }
            onChange={onOriginLabelChange}
            onSelect={(place) =>
              onOriginChange(
                { latitude: place.latitude, longitude: place.longitude },
                place.label,
              )
            }
            placeholder="Enter a starting place"
          />
        </div>
        {onUseSearchCenter && (
          <Button type="button" variant="outline" onClick={onUseSearchCenter}>
            Use search center
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onUseLocation}>
          Use my location
        </Button>
        <Button type="button" variant="outline" onClick={onPickOnMap}>
          Pick on map
        </Button>
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor="explore-route-mode">Travel mode</label>
          <select
            id="explore-route-mode"
            className="w-full"
            value={mode}
            onChange={(event) => onModeChange(event.target.value as TravelMode)}
          >
            <option value="walk">Walking</option>
            <option value="bicycle">Cycling</option>
            <option value="car">Driving</option>
          </select>
        </div>
        <Button
          type="button"
          className="col-span-2 lg:col-span-1"
          disabled={!eventTitle || !origin || loading}
          onClick={onBuild}
        >
          {loading ? 'Building…' : 'Build route'}
        </Button>
      </div>
      {origin && (
        <p className="text-xs text-neutral-600">
          Start: {originLabel || 'Map point'}. Drag the marker to change it.
        </p>
      )}
      <p className="text-xs text-neutral-600">
        When you build a route, Interline&apos;s Transitland Valhalla API
        receives its start and destination coordinates.
      </p>
      {route && (
        <p className="text-sm font-semibold">
          {(route.distanceMeters / 1000).toFixed(1)} km · About{' '}
          {Math.max(1, Math.round(route.durationSeconds / 60))} min
        </p>
      )}
    </div>
  );
}
