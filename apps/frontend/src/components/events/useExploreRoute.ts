'use client';

import { useEffect, useRef, useState } from 'react';
import type { EventRouteResponse, TravelMode } from '@event-sharing/contracts';
import { eventsClient } from '@/lib/api/EventsClient';
import { eventRouteClient } from '@/lib/api/EventRouteClient';
import type { DevicePosition } from '@/contexts/SearchPreferenceContext';
import type { MapPoint } from '@/components/map/MapView';
import { useToast } from '@/contexts/ToastContext';

type Destination = { id: string; title: string; point: MapPoint };

export function useExploreRoute(
  userId: string | undefined,
  requestPosition: () => Promise<DevicePosition>,
) {
  const { show } = useToast();
  const [destination, setDestination] = useState<Destination | null>(null);
  const [origin, setOrigin] = useState<MapPoint | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [mode, setMode] = useState<TravelMode>('walk');
  const [route, setRoute] = useState<EventRouteResponse | null>(null);
  const [error, setError] = useState('');
  const [request, setRequest] = useState(0);
  const [loading, setLoading] = useState(false);
  const eventRequestId = useRef(0);

  function clear() {
    eventRequestId.current++;
    setDestination(null);
    setOrigin(null);
    setOriginLabel('');
    setRoute(null);
    setError('');
    setRequest(0);
    setLoading(false);
  }

  useEffect(() => clear(), [userId]);

  useEffect(() => {
    if (!request || !destination || !origin) return;
    const controller = new AbortController();
    setLoading(true);
    setRoute(null);
    setError('');
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
  }, [
    request,
    destination?.id,
    origin?.latitude,
    origin?.longitude,
    mode,
    show,
  ]);

  async function chooseEvent(id: string): Promise<Destination | null> {
    const current = ++eventRequestId.current;
    try {
      const event = await eventsClient.get(id);
      if (current !== eventRequestId.current) return null;
      if (
        event.location.latitude === null ||
        event.location.longitude === null
      ) {
        setDestination(null);
        setRoute(null);
        show(
          'The exact event venue is not available to your account.',
          'error',
        );
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
        show(
          cause instanceof Error
            ? cause.message
            : 'Could not load the event venue.',
          'error',
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
      show(
        cause instanceof Error
          ? cause.message
          : 'Current location is unavailable.',
        'error',
      );
    }
  }

  function chooseOrigin(point: MapPoint, label: string) {
    setOrigin(point);
    setOriginLabel(label);
  }

  function changeOriginLabel(value: string) {
    setOriginLabel(value);
    setOrigin(null);
    setRoute(null);
    setError('');
  }

  return {
    destination,
    origin,
    originLabel,
    mode,
    route,
    error,
    loading,
    chooseEvent,
    chooseOrigin,
    changeOriginLabel,
    useCurrentLocation,
    setMode,
    build: () => setRequest((current) => current + 1),
    clear,
  };
}
