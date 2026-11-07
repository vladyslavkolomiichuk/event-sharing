'use client';

import { useEffect, useRef, useState } from 'react';
import {
  GeoJSONSource,
  LngLatBounds,
  Map,
  Marker,
  Popup,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl';
import { cn } from '@/lib/utils';
import { Notice } from '@/components/feedback/Notice';

export type MapPoint = { latitude: number; longitude: number };
export type MapRadius = { center: MapPoint; radiusMeters: number };
export type MapMarker = MapPoint & {
  id: string;
  label: string;
  approximate?: boolean;
  selected?: boolean;
  count?: number;
  user?: boolean;
  draggable?: boolean;
  kind?: 'search' | 'route';
  avatarUrl?: string;
};

export function MapView({
  center,
  zoom,
  markers,
  route,
  radius,
  onPick,
  onMarkerClick,
  onMarkerDrag,
  visible = true,
  exploreLayout = false,
  selectedPopup,
  onPopupRoute,
  onPopupClose,
  onViewportChange,
  selectedMarkerId,
  className,
}: {
  center: MapPoint;
  zoom: number;
  markers: MapMarker[];
  route?: MapPoint[];
  radius?: MapRadius;
  onPick?: (point: MapPoint) => void;
  onMarkerClick?: (id: string) => void;
  onMarkerDrag?: (id: string, point: MapPoint) => void;
  visible?: boolean;
  exploreLayout?: boolean;
  selectedPopup?: {
    id: string;
    title: string;
    point: MapPoint;
    approximate: boolean;
  } | null;
  onPopupRoute?: (id: string) => void;
  onPopupClose?: () => void;
  onViewportChange?: (point: MapPoint) => void;
  selectedMarkerId?: string | null;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker[]>([]);
  const onPickRef = useRef(onPick);
  const onMarkerClickRef = useRef(onMarkerClick);
  const onMarkerDragRef = useRef(onMarkerDrag);
  const onPopupRouteRef = useRef(onPopupRoute);
  const onPopupCloseRef = useRef(onPopupClose);
  const onViewportChangeRef = useRef(onViewportChange);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  onPickRef.current = onPick;
  onMarkerClickRef.current = onMarkerClick;
  onMarkerDragRef.current = onMarkerDrag;
  onPopupRouteRef.current = onPopupRoute;
  onPopupCloseRef.current = onPopupClose;
  onViewportChangeRef.current = onViewportChange;

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
        minZoom: -1,
      });
      map.addControl(
        new NavigationControl({ showCompass: false }),
        'top-right',
      );
      map.on('load', () => setReady(true));
      map.on('error', () =>
        setError('Map tiles could not load. Check your connection.'),
      );
      map.on('click', (event) => {
        const target = event.originalEvent.target;
        if (
          target instanceof Element &&
          target.closest(
            '.maplibregl-control-container, .maplibregl-marker, .maplibregl-popup',
          )
        )
          return;
        const point = event.lngLat.wrap();
        onPickRef.current?.({
          latitude: point.lat,
          longitude: point.lng,
        });
      });
      map.on('moveend', (event) => {
        if (!event.originalEvent) return;
        const point = map.getCenter().wrap();
        onViewportChangeRef.current?.({
          latitude: point.lat,
          longitude: point.lng,
        });
      });
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
    });
  }, [center.latitude, center.longitude, zoom]);

  useEffect(() => {
    if (visible) requestAnimationFrame(() => mapRef.current?.resize());
  }, [visible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      if (container.clientWidth && container.clientHeight)
        mapRef.current?.resize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coordinates = radius ? radiusCoordinates(radius) : [];
    const data = coordinates.length
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [coordinates] },
        }
      : { type: 'FeatureCollection' as const, features: [] };
    const source = map.getSource('search-radius') as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('search-radius', { type: 'geojson', data });
      map.addLayer({
        id: 'search-radius-fill',
        type: 'fill',
        source: 'search-radius',
        paint: { 'fill-color': '#f59c5a', 'fill-opacity': 0.13 },
      });
      map.addLayer({
        id: 'search-radius-outline',
        type: 'line',
        source: 'search-radius',
        paint: { 'line-color': '#d86723', 'line-width': 2 },
      });
    }
  }, [
    ready,
    radius?.center.latitude,
    radius?.center.longitude,
    radius?.radiusMeters,
  ]);

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
      const height = map.getContainer().clientHeight;
      map.fitBounds(bounds, {
        padding: exploreLayout
          ? {
              left: 40,
              right: 50,
              top: Math.min(110, height * 0.25),
              bottom: 75,
            }
          : 50,
        maxZoom: 14,
        duration: 700,
      });
    }
  }, [route, ready, exploreLayout]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markerRef.current.forEach((marker) => marker.remove());
    markerRef.current = markers.map((item) => {
      const element = item.user
        ? document.createElement('div')
        : document.createElement('button');
      if (!item.user) (element as HTMLButtonElement).type = 'button';
      element.className = `event-map-marker${item.selected ? ' event-map-marker-selected' : ''}${item.approximate ? ' event-map-marker-approximate' : ''}${item.user ? ' event-map-marker-user' : ''}${item.draggable ? ' event-map-marker-draggable' : ''}${item.kind ? ` event-map-marker-${item.kind}` : ''}`;
      element.setAttribute('aria-label', item.label);
      element.title = item.label;
      if (item.count && item.count > 1)
        element.textContent = String(item.count);
      else if (item.avatarUrl) {
        const avatar = document.createElement('img');
        avatar.src = item.avatarUrl;
        avatar.alt = '';
        avatar.loading = 'lazy';
        avatar.className = 'event-map-marker-avatar';
        avatar.onerror = () => avatar.remove();
        element.appendChild(avatar);
      } else if (item.kind === 'search' || item.kind === 'route') {
        const symbol = document.createElement('span');
        symbol.className = 'event-map-marker-symbol';
        symbol.textContent = item.kind === 'search' ? '+' : '↗';
        element.appendChild(symbol);
      }
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
          const point = marker.getLngLat().wrap();
          onMarkerDragRef.current?.(item.id, {
            latitude: point.lat,
            longitude: point.lng,
          });
        });
      }
      return marker;
    });
  }, [markers, ready]);

  useEffect(() => {
    markerRef.current.forEach((marker, index) => {
      const item = markers[index];
      marker
        .getElement()
        .classList.toggle(
          'event-map-marker-selected',
          Boolean(item?.selected || item?.id === selectedMarkerId),
        );
    });
  }, [markers, ready, selectedMarkerId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !selectedPopup) return;
    const content = document.createElement('div');
    content.className = 'space-y-2 p-1 text-sm';
    const title = document.createElement('p');
    title.className = 'font-semibold';
    title.textContent = selectedPopup.title;
    content.appendChild(title);
    if (selectedPopup.approximate) {
      const note = document.createElement('p');
      note.className = 'text-xs text-neutral-600';
      note.textContent = 'Approximate location';
      content.appendChild(note);
    }
    const actions = document.createElement('div');
    actions.className = 'flex flex-wrap gap-3';
    const link = document.createElement('a');
    link.href = `/events/${encodeURIComponent(selectedPopup.id)}`;
    link.className = 'font-semibold underline';
    link.textContent = 'View event';
    const routeButton = document.createElement('button');
    routeButton.type = 'button';
    routeButton.className = 'font-semibold underline';
    routeButton.textContent = 'Build route';
    routeButton.addEventListener('click', () =>
      onPopupRouteRef.current?.(selectedPopup.id),
    );
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'font-semibold underline';
    closeButton.textContent = 'Close';
    closeButton.addEventListener('click', () => onPopupCloseRef.current?.());
    actions.append(link, routeButton, closeButton);
    content.appendChild(actions);
    const popup = new Popup({
      offset: 20,
      closeButton: false,
      closeOnClick: false,
      maxWidth: '260px',
    })
      .setLngLat([selectedPopup.point.longitude, selectedPopup.point.latitude])
      .setDOMContent(content)
      .addTo(map);
    return () => {
      popup.remove();
    };
  }, [
    ready,
    selectedPopup?.id,
    selectedPopup?.title,
    selectedPopup?.point.latitude,
    selectedPopup?.point.longitude,
    selectedPopup?.approximate,
  ]);

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

function radiusCoordinates({
  center,
  radiusMeters,
}: MapRadius): [number, number][] {
  const latitude = (center.latitude * Math.PI) / 180;
  const longitude = (center.longitude * Math.PI) / 180;
  const distance = radiusMeters / 6371008.771415;
  const points: [number, number][] = [];
  for (let index = 0; index <= 96; index++) {
    const bearing = (index / 96) * 2 * Math.PI;
    const nextLatitude = Math.asin(
      Math.sin(latitude) * Math.cos(distance) +
        Math.cos(latitude) * Math.sin(distance) * Math.cos(bearing),
    );
    const nextLongitude =
      longitude +
      Math.atan2(
        Math.sin(bearing) * Math.sin(distance) * Math.cos(latitude),
        Math.cos(distance) - Math.sin(latitude) * Math.sin(nextLatitude),
      );
    points.push([
      (nextLongitude * 180) / Math.PI,
      (nextLatitude * 180) / Math.PI,
    ]);
  }
  return points;
}
