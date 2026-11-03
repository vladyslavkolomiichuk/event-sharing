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
  onPickOnMap,
  onBuild,
  onClear,
  route,
  loading,
  error,
}: {
  eventTitle: string | null;
  origin: MapPoint | null;
  originLabel: string;
  onOriginLabelChange: (value: string) => void;
  onOriginChange: (point: MapPoint, label: string) => void;
  mode: TravelMode;
  onModeChange: (mode: TravelMode) => void;
  onUseLocation: () => void;
  onPickOnMap: () => void;
  onBuild: () => void;
  onClear: () => void;
  route: EventRouteResponse | null;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          Destination: {eventTitle ?? 'Choose an event from the list or map'}
        </p>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Clear route
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_auto_auto_140px_auto] md:items-end">
        <PlaceAutocomplete
          id="explore-route-origin"
          label="Starting address or city"
          kind="address"
          value={
            originLabel === 'Map point' || originLabel === 'Current location'
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
        <Button type="button" variant="outline" onClick={onUseLocation}>
          Use my location
        </Button>
        <Button type="button" variant="outline" onClick={onPickOnMap}>
          Pick on map
        </Button>
        <div>
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
      {route && (
        <p className="text-sm font-semibold">
          {(route.distanceMeters / 1000).toFixed(1)} km · About{' '}
          {Math.max(1, Math.round(route.durationSeconds / 60))} min
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
