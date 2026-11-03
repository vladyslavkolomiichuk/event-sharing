'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import { cn } from '@/lib/utils';
import { Notice } from '@/components/feedback/Notice';

export type MapPoint = { latitude: number; longitude: number };
export type MapMarker = MapPoint & {
  id: string;
  label: string;
  approximate?: boolean;
  selected?: boolean;
  count?: number;
  user?: boolean;
  draggable?: boolean;
};

export function MapView({
  center,
  zoom,
  markers,
  route,
  onPick,
  onMarkerClick,
  onMarkerDrag,
  visible = true,
  className,
}: {
  center: MapPoint;
  zoom: number;
  markers: MapMarker[];
  route?: MapPoint[];
  onPick?: (point: MapPoint) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDrag?: (id: string, point: MapPoint) => void;
  visible?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker[]>([]);
  const onPickRef = useRef(onPick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  onPickRef.current = onPick;
  onMarkerClickRef.current = onMarkerClick;
  onMarkerDragRef.current = onMarkerDrag;

  useEffect(() => {
    if (!containerRef.current) return;
    try {
      setWorkerUrl(
        new URL(
          'maplibre-gl/dist/maplibre-gl-worker.mjs',
          import.meta.url,
        ).toString(),
      );
      const map = new Map({
        container: containerRef.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [center.longitude, center.latitude],
        zoom,
      });
      map.addControl(
        new NavigationControl({ showCompass: false }),
        'top-right',
      );
      map.on('load', () => setReady(true));
      map.on('error', () =>
        setError('Map tiles could not load. Check your connection.'),
      );
      map.on('click', (event) =>
        onPickRef.current?.({
          latitude: event.lngLat.lat,
          longitude: event.lngLat.lng,
        }),
      );
      mapRef.current = map;
      return () => {
        markerRef.current.forEach((marker) => marker.remove());
        markerRef.current = [];
        map.remove();
        mapRef.current = null;
      };
    } catch {
      setError('This browser cannot display the interactive map.');
    }
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [center.longitude, center.latitude],
      zoom,
      essential: true,
    });
  }, [center.latitude, center.longitude, zoom]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => mapRef.current?.resize());
  }, [visible]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coordinates = (route ?? []).map((point) => [
      point.longitude,
      point.latitude,
    ]);
    const data =
      coordinates.length >= 2
        ? {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates },
          }
        : { type: 'FeatureCollection' as const, features: [] };
    const source = map.getSource('event-route') as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('event-route', { type: 'geojson', data });
      map.addLayer({
        id: 'event-route-outline',
        type: 'line',
        source: 'event-route',
        paint: { 'line-color': '#fff', 'line-width': 8 },
      });
      map.addLayer({
        id: 'event-route-line',
        type: 'line',
        source: 'event-route',
        paint: { 'line-color': '#111', 'line-width': 4 },
      });
    }
    if (coordinates.length >= 2) {
      const bounds = new LngLatBounds();
      for (const point of coordinates) bounds.extend(point as [number, number]);
      map.fitBounds(bounds, { padding: 50, maxZoom: 14 });
    }
  }, [route, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = markers.map((item) => {
      const element = item.user
        ? document.createElement('div')
        : document.createElement('button');
      if (!item.user) (element as HTMLButtonElement).type = 'button';
      element.className = `event-map-marker${item.selected ? ' event-map-marker-selected' : ''}${item.approximate ? ' event-map-marker-approximate' : ''}${item.user ? ' event-map-marker-user' : ''}${item.draggable ? ' event-map-marker-draggable' : ''}`;
      element.setAttribute('aria-label', item.label);
      element.title = item.label;
      if (item.count && item.count > 1)
        element.textContent = String(item.count);
      if (!item.user)
        element.addEventListener('click', (event) => {
          event.stopPropagation();
          if (!item.draggable) onMarkerClickRef.current?.(item.id);
        });
      const marker = new Marker({
        element,
        anchor: 'bottom',
        draggable: item.draggable ?? false,
      })
        .setLngLat([item.longitude, item.latitude])
        .addTo(map);
      if (item.draggable) {
        marker.on('dragend', () => {
          const point = marker.getLngLat();
          onMarkerDragRef.current?.(item.id, {
            latitude: point.lat,
            longitude: point.lng,
          });
        });
      }
      return marker;
    });
  }, [markers, ready]);

  return (
    <div
      className={cn(
        'event-map relative overflow-hidden rounded-xl border border-neutral-300 bg-neutral-100',
        className,
      )}
    >
      <div
        ref={containerRef}
        className="h-full w-full"
        aria-label="Interactive map"
      />
      {!ready && !error && (
        <p className="absolute left-4 top-4 rounded bg-white px-3 py-2 text-sm">
          Loading map…
        </p>
      )}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
