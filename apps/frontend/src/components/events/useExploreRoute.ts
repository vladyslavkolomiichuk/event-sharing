'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventRouteResponse, TravelMode } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { eventRouteClient } from '@/lib/api/EventRouteClient';
import type { DevicePosition } from '@/contexts/SearchPreferenceContext';
import type { MapPoint } from '@/components/map/MapView';

type Destination = { id: string; title: string; point: MapPoint };

export function useExploreRoute(
  userId: string | undefined,
  requestPosition: () => Promise<DevicePosition>,
) {
  const [destination, setDestination] = useState<Destination | null>(null);
  const [origin, setOrigin] = useState<MapPoint | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [mode, setMode] = useState<TravelMode>('walk');
  const [route, setRoute] = useState<EventRouteResponse | null>(null);
  const [request, setRequest] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const eventRequestId = useRef(0);

  function clear() {
    eventRequestId.current++;
    setDestination(null);
    setOrigin(null);
    setOriginLabel('');
    setRoute(null);
    setRequest(0);
    setLoading(false);
    setError('');
  }

  useEffect(() => clear(), [userId]);

  useEffect(() => {
    if (!request || !destination || !origin) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setRoute(null);
    void eventRouteClient
      .route({ eventId: destination.id, origin, mode }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRoute(result);
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Could not build a route.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request, destination?.id, origin?.latitude, origin?.longitude, mode]);

  async function chooseEvent(id: string): Promise<Destination | null> {
    const current = ++eventRequestId.current;
    setError('');
    try {
      const event = await eventsClient.get(id);
      if (current !== eventRequestId.current) return null;
      if (
        event.location.latitude === null ||
        event.location.longitude === null
      ) {
        setDestination(null);
        setRoute(null);
        setError('The exact event venue is not available to your account.');
        return null;
      }
      const next = {
        id,
        title: event.title,
        point: {
          latitude: event.location.latitude,
          longitude: event.location.longitude,
        },
      };
      setDestination(next);
      return next;
    } catch (cause) {
      if (current === eventRequestId.current)
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not load the event venue.',
        );
      return null;
    }
  }

  async function useCurrentLocation() {
    try {
      const found = await requestPosition();
      chooseOrigin(
        { latitude: found.latitude, longitude: found.longitude },
        'Current location',
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Current location is unavailable.',
      );
    }
  }

  function chooseOrigin(point: MapPoint, label: string) {
    setOrigin(point);
    setOriginLabel(label);
    setError('');
  }

  function changeOriginLabel(value: string) {
    setOriginLabel(value);
    setOrigin(null);
    setRoute(null);
  }

  return {
    destination,
    origin,
    originLabel,
    mode,
    route,
    loading,
    error,
    chooseEvent,
    chooseOrigin,
    changeOriginLabel,
    useCurrentLocation,
    setMode,
    build: () => setRequest((current) => current + 1),
    clear,
  };
}
