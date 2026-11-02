import type { MapPoint } from '@/components/map/MapView';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function EventLocationFilters({
  city,
  onCityChange,
  onCitySelect,
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
  city: string;
  onCityChange: (value: string) => void;
  onCitySelect: (point: MapPoint, label: string) => void;
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
    <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_130px_150px_150px_130px_auto] lg:items-end">
      <PlaceAutocomplete
        id="event-map-city"
        label="Search around a city"
        kind="city"
        value={city}
        onChange={onCityChange}
        onSelect={(place) =>
          onCitySelect(
            { latitude: place.latitude, longitude: place.longitude },
            place.label,
          )
        }
        placeholder="Choose a city"
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
