'use client';

import { useEffect, useState } from 'react';
import type {
  EventDetail,
  EventRouteResponse,
  RoutePoint,
  TravelMode,
} from '@event-sharing/contracts';
import { eventRouteClient } from '@/lib/api/EventRouteClient';
import { useSearchPreference } from '@/contexts/SearchPreferenceContext';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { MapView } from '@/components/map/MapView';
import { Button } from '@/components/ui/button';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

export function EventRoutePlanner({ event }: { event: EventDetail }) {
  const { requestPosition } = useSearchPreference();
  const [origin, setOrigin] = useState<RoutePoint | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [placeKind, setPlaceKind] = useState<'city' | 'address'>('address');
  const [mode, setMode] = useState<TravelMode>('walk');
  const [route, setRoute] = useState<EventRouteResponse | null>(null);
  const [routeRequestId, setRouteRequestId] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const destination =
    event.location.latitude !== null && event.location.longitude !== null
      ? {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
        }
      : null;

  useEffect(() => {
    if (routeRequestId === 0 || !origin || !destination) return;
    const controller = new AbortController();
    setLoading(true);
    setRoute(null);
    setError('');
    void eventRouteClient
      .route({ eventId: event.id, origin, mode }, controller.signal)
      .then(setRoute)
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error ? cause.message : 'Could not build a route.',
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    event.id,
    origin?.latitude,
    origin?.longitude,
    mode,
    destination?.latitude,
    destination?.longitude,
    routeRequestId,
  ]);

  async function useCurrentPosition() {
    setError('');
    try {
      const position = await requestPosition();
      setOrigin({ latitude: position.latitude, longitude: position.longitude });
      setOriginLabel('Current location');
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Current location is unavailable.',
      );
    }
  }

  function choosePoint(point: RoutePoint) {
    setOrigin(point);
    setOriginLabel('Map point');
  }

  if (!destination) return null;

  return (
    <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
      <h2>Route to this event</h2>
      <p className="text-sm text-neutral-600">
        Choose a starting point by address, city, map, or your current location.
        Interline&apos;s Transitland Valhalla API receives both route points
        when you request a route.
      </p>
      <div className="grid gap-3 sm:grid-cols-[140px_1fr_auto] sm:items-end">
        <div>
          <label htmlFor="route-place-kind">Starting place</label>
          <select
            id="route-place-kind"
            className="w-full"
            value={placeKind}
            onChange={(change) => {
              setPlaceKind(change.target.value as 'city' | 'address');
              setOriginLabel('');
              setOrigin(null);
              setRoute(null);
              setError('');
            }}
          >
            <option value="address">Address</option>
            <option value="city">City</option>
          </select>
        </div>
        <PlaceAutocomplete
          id="route-origin"
          label={placeKind === 'address' ? 'Address' : 'City'}
          kind={placeKind}
          value={
            originLabel === 'Map point' || originLabel === 'Current location'
              ? ''
              : originLabel
          }
          onChange={(value) => {
            setOriginLabel(value);
            setOrigin(null);
            setRoute(null);
            setError('');
          }}
          onSelect={(place) => {
            setOrigin({ latitude: place.latitude, longitude: place.longitude });
            setOriginLabel(place.label);
          }}
          placeholder={
            placeKind === 'address'
              ? 'Enter a starting address'
              : 'Enter a starting city'
          }
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => void useCurrentPosition()}
        >
          Use my location
        </Button>
      </div>
      <div>
        <label htmlFor="route-mode">Travel mode</label>
        <select
          id="route-mode"
          className="w-full sm:w-48"
          value={mode}
          onChange={(change) => setMode(change.target.value as TravelMode)}
        >
          <option value="walk">Walking</option>
          <option value="bicycle">Cycling</option>
          <option value="car">Driving</option>
        </select>
      </div>
      <p className="text-sm text-neutral-600">
        {origin
          ? `Starting point: ${originLabel || 'Map point'}. Drag the marker or click the map to change it.`
          : 'Click the map to choose a starting point.'}
      </p>
      <Button
        type="button"
        disabled={!origin || loading}
        onClick={() => setRouteRequestId((current) => current + 1)}
      >
        Build route
      </Button>
      <MapView
        center={origin ?? destination}
        zoom={12}
        markers={[
          { id: 'destination', label: 'Event venue', ...destination },
          ...(origin
            ? [
                {
                  id: 'origin',
                  label: 'Starting point. Drag to move.',
                  ...origin,
                  draggable: true,
                },
              ]
            : []),
        ]}
        route={route?.coordinates.map(([longitude, latitude]) => ({
          latitude,
          longitude,
        }))}
        onPick={choosePoint}
        onMarkerDrag={(id, point) => {
          if (id === 'origin') choosePoint(point);
        }}
        className="h-[420px]"
      />
      {loading && <p className="text-sm text-neutral-600">Building route…</p>}
      {error && (
        <InlineFeedback
          message={`${error} Try another starting point or travel mode, then build the route again.`}
          tone="error"
        />
      )}
      {route && (
        <p className="text-sm font-semibold">
          {(route.distanceMeters / 1000).toFixed(1)} km · About{' '}
          {Math.max(1, Math.round(route.durationSeconds / 60))} min
        </p>
      )}
    </section>
  );
}
