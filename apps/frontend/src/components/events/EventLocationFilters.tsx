import type { MapPoint } from '@/components/map/MapView';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EventLocationFilters({
  placeQuery,
  onPlaceQueryChange,
  placeKind,
  onPlaceKindChange,
  onPlaceSelect,
  locationActive,
  radiusKm,
  onRadiusChange,
  startFrom,
  onStartFromChange,
  startTo,
  onStartToChange,
  status,
  onStatusChange,
  onClearLocation,
}: {
  placeQuery: string;
  onPlaceQueryChange: (value: string) => void;
  placeKind: 'city' | 'address';
  onPlaceKindChange: (kind: 'city' | 'address') => void;
  onPlaceSelect: (point: MapPoint, label: string) => void;
  locationActive: boolean;
  radiusKm: number;
  onRadiusChange: (value: number) => void;
  startFrom: string;
  onStartFromChange: (value: string) => void;
  startTo: string;
  onStartToChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  onClearLocation: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[110px_minmax(180px,1fr)_110px_140px_140px_120px_auto] lg:items-end">
      <div>
        <label htmlFor="event-place-kind">Find by</label>
        <select
          id="event-place-kind"
          className="w-full"
          value={placeKind}
          onChange={(event) =>
            onPlaceKindChange(event.target.value as 'city' | 'address')
          }
        >
          <option value="city">City</option>
          <option value="address">Address</option>
        </select>
      </div>
      <PlaceAutocomplete
        id="event-map-place"
        label={
          placeKind === 'city'
            ? 'Search around a city'
            : 'Search around an address'
        }
        kind={placeKind}
        value={placeQuery}
        onChange={onPlaceQueryChange}
        onSelect={(place) =>
          onPlaceSelect(
            { latitude: place.latitude, longitude: place.longitude },
            place.label,
          )
        }
        placeholder={
          placeKind === 'city' ? 'Choose a city' : 'Choose an address'
        }
      />
      <div>
        <label htmlFor="event-search-radius">Radius</label>
        <select
          id="event-search-radius"
          className="w-full"
          value={radiusKm}
          disabled={!locationActive}
          onChange={(event) => onRadiusChange(Number(event.target.value))}
        >
          {[5, 15, 30, 50, 100].map((value) => (
            <option key={value} value={value}>
              {value} km
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="event-search-from">From</label>
        <Input
          id="event-search-from"
          type="date"
          value={startFrom}
          max={startTo || undefined}
          onChange={(event) => onStartFromChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="event-search-to">Until</label>
        <Input
          id="event-search-to"
          type="date"
          value={startTo}
          min={startFrom || undefined}
          onChange={(event) => onStartToChange(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="event-search-status">Status</label>
        <select
          id="event-search-status"
          className="w-full"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
        >
          <option value="">All active</option>
          <option value="PUBLISHED">Published</option>
          <option value="ONGOING">Ongoing</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>
      <Button
        type="button"
        variant="ghost"
        disabled={!locationActive}
        onClick={onClearLocation}
      >
        Clear location
      </Button>
    </div>
  );
}
