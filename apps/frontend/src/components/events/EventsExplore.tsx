'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  EventSearchQuery,
  SearchEvent,
  SearchLocationSource,
} from '@event-sharing/contracts';
import { searchClient } from '@/lib/api/SearchClient';
import { eventsClient, type Category } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { placesClient } from '@/lib/api/PlacesClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { useSearchPreference } from '@/contexts/SearchPreferenceContext';
import {
  MapView,
  type MapMarker,
  type MapPoint,
} from '@/components/map/MapView';
import { ExploreResultsPanel } from './ExploreResultsPanel';
import { EventSearchToolbar } from './EventSearchToolbar';
import { EventLocationFilters } from './EventLocationFilters';
import { ExploreRouteControls } from './ExploreRouteControls';
import { useExploreRoute } from './useExploreRoute';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';

const worldCenter: MapPoint = { latitude: 20, longitude: 0 };

export function EventsExplore() {
  const { user, loading: authLoading } = useAuth();
  const { show } = useToast();
  const { mode, permission, position, chooseMode, requestPosition } =
    useSearchPreference();
  const [items, setItems] = useState<SearchEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [text, setText] = useState('');
  const [searchText, setSearchText] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [status, setStatus] = useState('');
  const [startFrom, setStartFrom] = useState('');
  const [startTo, setStartTo] = useState('');
  const [sort, setSort] = useState<'start_time' | 'distance' | 'relevance'>(
    'start_time',
  );
  const [radiusKm, setRadiusKm] = useState(15);
  const [center, setCenter] = useState<MapPoint>(worldCenter);
  const [zoom, setZoom] = useState(2);
  const [placeQuery, setPlaceQuery] = useState('');
  const [anchorLabel, setAnchorLabel] = useState('');
  const [placeKind, setPlaceKind] = useState<'city' | 'address'>('city');
  const [anchor, setAnchor] = useState<MapPoint | null>(null);
  const [anchorSource, setAnchorSource] = useState<SearchLocationSource | null>(
    null,
  );
  const [userLocation, setUserLocation] = useState<MapPoint | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [cityCenters, setCityCenters] = useState<Record<string, MapPoint>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapPickMode, setMapPickMode] = useState<'search' | 'route-origin'>(
    'search',
  );
  const routePlanner = useExploreRoute(user?.id, requestPosition);
  const requestId = useRef(0);
  const locationRequestId = useRef(0);
  const locationSelected = useRef(false);
  const needsLocation = mode !== 'UNSET' && mode !== 'ANYWHERE' && !anchor;

  useEffect(() => {
    const timer = setTimeout(() => setSearchText(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (!searchText && sort === 'relevance') setSort('start_time');
  }, [searchText, sort]);

  useEffect(() => {
    if (!user) return;
    eventsClient
      .categories()
      .then(setCategories)
      .catch(() => show('Could not load categories.', 'error'));
  }, [user?.id, show]);

  useEffect(() => {
    locationRequestId.current++;
    locationSelected.current = false;
    setUserLocation(null);
    setAccuracy(null);
    setAnchor(null);
    setAnchorSource(null);
    setPlaceQuery('');
    setAnchorLabel('');
    setCenter(worldCenter);
    setZoom(2);
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    if (mode === 'ANYWHERE') {
      if (!locationSelected.current) {
        setCenter(worldCenter);
        setZoom(2);
      }
      return;
    }
    if (mode === 'DEVICE') return;
    if (mode === 'CITY') setPlaceKind('city');
    if (mode === 'ADDRESS') setPlaceKind('address');
    let cancelled = false;
    usersClient
      .me()
      .then(async (profile) => {
        if (!profile.city) return;
        const [place] = await placesClient.search(profile.city, 'city');
        if (cancelled || !place) return;
        const point = { latitude: place.latitude, longitude: place.longitude };
        if (!locationSelected.current) {
          setCenter(point);
          setZoom(11);
          if (mode === 'CITY') {
            setPlaceKind('city');
            setPlaceQuery(profile.city);
            setAnchorLabel(profile.city);
            setAnchor(point);
            setAnchorSource('CITY');
            setSort('distance');
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.id, mode]);

  useEffect(() => {
    if (mode !== 'DEVICE' || !position || locationSelected.current) return;
    const point = {
      latitude: position.latitude,
      longitude: position.longitude,
    };
    locationSelected.current = true;
    setUserLocation(point);
    setAccuracy(position.accuracy);
    setAnchor(point);
    setAnchorSource('DEVICE');
    setCenter(point);
    setZoom(12);
    setSort('distance');
  }, [mode, position]);

  useEffect(() => {
    if (
      !user ||
      mode !== 'DEVICE' ||
      permission !== 'granted' ||
      position ||
      locationSelected.current
    )
      return;
    void requestPosition().catch(() => {});
  }, [user?.id, mode, permission, position, requestPosition]);

  const load = useCallback(
    async (next?: string) => {
      if (!user) return;
      if (needsLocation) {
        setLoading(false);
        return;
      }
      const current = ++requestId.current;
      setLoading(true);
      setError('');
      const query: EventSearchQuery = {
        sort: sort === 'distance' && !anchor ? 'start_time' : sort,
        limit: 20,
        ...(searchText ? { text: searchText } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(status ? { status: status as EventSearchQuery['status'] } : {}),
        ...(startFrom
          ? { startFrom: new Date(`${startFrom}T00:00:00`).toISOString() }
          : {}),
        ...(startTo
          ? { startTo: new Date(`${startTo}T23:59:59.999`).toISOString() }
          : {}),
        ...(anchor && anchorSource
          ? {
              latitude: anchor.latitude,
              longitude: anchor.longitude,
              radiusMeters: radiusKm * 1000,
              locationSource: anchorSource,
            }
          : {}),
        ...(next ? { cursor: next } : {}),
      };
      try {
        const page = await searchClient.events(query);
        if (current !== requestId.current) return;
        setItems((previous) =>
          next ? [...previous, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
      } catch (cause) {
        if (current !== requestId.current) return;
        const message =
          cause instanceof Error ? cause.message : 'Could not search events.';
        setError(message);
        show(message, 'error');
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [
      user?.id,
      searchText,
      categoryId,
      status,
      startFrom,
      startTo,
      sort,
      anchor,
      anchorSource,
      radiusKm,
      needsLocation,
      show,
    ],
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load();
    return () => {
      requestId.current++;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const regions = [
      ...new Set(
        items
          .filter((item) => item.location.latitude === null)
          .map((item) => item.location.region)
          .filter((region): region is string => Boolean(region)),
      ),
    ];
    async function resolveCities() {
      for (const region of regions) {
        if (cancelled || cityCenters[region]) continue;
        try {
          const [place] = await placesClient.search(region, 'city');
          if (!cancelled && place)
            setCityCenters((previous) => ({
              ...previous,
              [region]: {
                latitude: place.latitude,
                longitude: place.longitude,
              },
            }));
        } catch {
          // Results remain available without an approximate map pin.
        }
      }
    }
    void resolveCities();
    return () => {
      cancelled = true;
    };
  }, [items, cityCenters]);

  const markers = useMemo<MapMarker[]>(() => {
    const publicPins = items
      .filter(
        (item) =>
          item.location.latitude !== null &&
          item.location.longitude !== null &&
          item.id !== routePlanner.destination?.id,
      )
      .map((item) => ({
        id: item.id,
        label:
          item.location.visibility === 'PUBLIC'
            ? item.title
            : `${item.title}; approximate location`,
        latitude: item.location.latitude!,
        longitude: item.location.longitude!,
        selected: selectedId === item.id,
        approximate: item.location.visibility !== 'PUBLIC',
      }));
    const privateRegions = new Map<string, number>();
    for (const item of items) {
      if (item.location.latitude === null && item.location.region)
        privateRegions.set(
          item.location.region,
          (privateRegions.get(item.location.region) ?? 0) + 1,
        );
    }
    const approximatePins = [...privateRegions].flatMap(([region, count]) =>
      cityCenters[region]
        ? [
            {
              id: `city:${region}`,
              label: `${count} events near ${region}; approximate city location`,
              ...cityCenters[region],
              approximate: true,
              selected: selectedRegion === region,
              count,
            },
          ]
        : [],
    );
    return [
      ...publicPins,
      ...approximatePins,
      ...(userLocation
        ? [
            {
              id: 'your-position',
              label: 'Your position, visible only to you',
              ...userLocation,
              user: true,
            },
          ]
        : []),
      ...(anchor && anchorSource !== 'DEVICE'
        ? [
            {
              id: 'search-anchor',
              label: 'Search center. Drag to move it.',
              ...anchor,
              draggable: true,
            },
          ]
        : []),
      ...(routePlanner.origin &&
      (!anchor ||
        routePlanner.origin.latitude !== anchor.latitude ||
        routePlanner.origin.longitude !== anchor.longitude)
        ? [
            {
              id: 'route-origin',
              label: 'Route start. Drag to move it.',
              ...routePlanner.origin,
              draggable: true,
            },
          ]
        : []),
      ...(routePlanner.destination
        ? [
            {
              id: routePlanner.destination.id,
              label: `Destination: ${routePlanner.destination.title}`,
              ...routePlanner.destination.point,
              selected: true,
            },
          ]
        : []),
    ];
  }, [
    items,
    cityCenters,
    selectedId,
    selectedRegion,
    userLocation,
    anchor,
    anchorSource,
    routePlanner.origin,
    routePlanner.destination,
  ]);

  async function chooseRouteEvent(id: string) {
    const destination = await routePlanner.chooseEvent(id);
    if (!destination) return;
    setSelectedId(id);
    setSelectedRegion(null);
    if (!routePlanner.origin && anchor) {
      routePlanner.chooseOrigin(
        anchor,
        anchorSource === 'DEVICE' ? 'Current location' : 'Search center',
      );
    }
    if (routePlanner.origin || anchor) {
      routePlanner.build();
      setMapPickMode('search');
      setResultsOpen(false);
    } else {
      setMapPickMode('route-origin');
      show('Choose a route start on the map or enter an address.', 'info');
    }
  }

  function clearRoute() {
    routePlanner.clear();
    setMapPickMode('search');
  }

  async function choosePlace(point: MapPoint, label: string) {
    const currentRequest = ++locationRequestId.current;
    const source = placeKind === 'city' ? 'CITY' : 'ADDRESS';
    try {
      await chooseMode(source);
    } catch (cause) {
      if (currentRequest !== locationRequestId.current) return;
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not save search method.',
        'error',
      );
      return;
    }
    if (currentRequest !== locationRequestId.current) return;
    locationSelected.current = true;
    setAnchor(point);
    setAnchorSource(source);
    setUserLocation(null);
    setAccuracy(null);
    setPlaceQuery(label);
    setAnchorLabel(label);
    setCenter(point);
    setZoom(11);
    setSort('distance');
  }

  function changePlace(value: string) {
    setPlaceQuery(value);
  }

  function changePlaceKind(kind: 'city' | 'address') {
    setPlaceKind(kind);
    changePlace('');
  }

  async function chooseMapPoint(point: MapPoint) {
    const currentRequest = ++locationRequestId.current;
    try {
      if (mode !== 'MAP') await chooseMode('MAP');
    } catch (cause) {
      if (currentRequest !== locationRequestId.current) return;
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not save search method.',
        'error',
      );
      return;
    }
    if (currentRequest !== locationRequestId.current) return;
    locationSelected.current = true;
    setAnchor(point);
    setAnchorSource('MAP');
    setUserLocation(null);
    setAccuracy(null);
    setPlaceQuery('');
    setAnchorLabel('');
    setCenter(point);
    setZoom((current) => Math.max(current, 11));
    setSort('distance');
  }

  async function useMyLocation() {
    const currentRequest = ++locationRequestId.current;
    try {
      const found = await requestPosition();
      if (currentRequest !== locationRequestId.current) return;
      await chooseMode('DEVICE');
      if (currentRequest !== locationRequestId.current) return;
      const point = { latitude: found.latitude, longitude: found.longitude };
      locationSelected.current = true;
      setUserLocation(point);
      setAccuracy(found.accuracy);
      setAnchor(point);
      setAnchorSource('DEVICE');
      setPlaceQuery('');
      setAnchorLabel('');
      setCenter(point);
      setZoom(12);
      setSort('distance');
      show('Nearby events are now shown around your position.', 'success');
    } catch (cause) {
      if (currentRequest !== locationRequestId.current) return;
      show(
        cause instanceof Error
          ? cause.message
          : 'Your location is unavailable.',
        'warning',
      );
    }
  }

  async function clearLocation() {
    const currentRequest = ++locationRequestId.current;
    try {
      await chooseMode('ANYWHERE');
    } catch (cause) {
      if (currentRequest !== locationRequestId.current) return;
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not save search method.',
        'error',
      );
      return;
    }
    if (currentRequest !== locationRequestId.current) return;
    locationSelected.current = false;
    setUserLocation(null);
    setAccuracy(null);
    setAnchor(null);
    setAnchorSource(null);
    setPlaceQuery('');
    setAnchorLabel('');
    setSort('start_time');
    setCenter(worldCenter);
    setZoom(2);
  }

  function selectEvent(item: SearchEvent) {
    if (routePlanner.destination && routePlanner.destination.id !== item.id)
      clearRoute();
    setSelectedId(item.id);
    setSelectedRegion(null);
    const point =
      item.location.latitude !== null && item.location.longitude !== null
        ? {
            latitude: item.location.latitude,
            longitude: item.location.longitude,
          }
        : item.location.region
          ? cityCenters[item.location.region]
          : null;
    if (point) {
      setCenter(point);
      setZoom(item.location.visibility === 'PUBLIC' ? 12 : 9);
      setResultsOpen(false);
    } else show('This event has no map position yet.', 'info');
  }

  function selectMarker(id: string) {
    if (
      id === 'search-anchor' ||
      id === 'route-origin' ||
      id === 'your-position'
    )
      return;
    if (id.startsWith('city:')) {
      const region = id.slice(5);
      setSelectedRegion(region);
      setSelectedId(null);
    } else {
      if (routePlanner.destination && routePlanner.destination.id !== id)
        clearRoute();
      setSelectedId(id);
      setSelectedRegion(null);
      requestAnimationFrame(() =>
        document
          .getElementById(`event-result-${id}`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
    }
    setResultsOpen(true);
  }

  const routePoints = useMemo(
    () =>
      routePlanner.route?.coordinates.map(([longitude, latitude]) => ({
        latitude,
        longitude,
      })),
    [routePlanner.route],
  );
  const selectedEvent = items.find((item) => item.id === selectedId);
  const locationLabel = anchor
    ? anchorSource === 'DEVICE'
      ? 'GPS'
      : anchorSource === 'MAP'
        ? 'Map point'
        : anchorLabel || 'Selected place'
    : needsLocation
      ? 'Choose a location'
      : 'Anywhere';

  if (authLoading) return <Loading />;
  if (!user)
    return (
      <div className="events-explore-fullscreen relative h-[calc(100dvh-61px)] overflow-hidden lg:h-dvh">
        <MapView
          center={worldCenter}
          zoom={2}
          markers={[]}
          className="absolute inset-0 h-full w-full rounded-none border-0"
        />
        <div className="absolute left-3 top-3 z-20 w-[min(390px,calc(100%-24px))] rounded-xl border border-neutral-200 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <h1>Explore events</h1>
          <p className="mt-2 text-sm text-neutral-600">
            Sign in to search events, use your location, and plan a route.
          </p>
          <Button asChild className="mt-4">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
      </div>
    );

  return (
    <div className="events-explore-fullscreen relative h-[calc(100dvh-61px)] overflow-hidden lg:h-dvh">
      <MapView
        center={center}
        zoom={zoom}
        markers={markers}
        radius={
          anchor ? { center: anchor, radiusMeters: radiusKm * 1000 } : undefined
        }
        route={routePoints}
        exploreLayout
        onPick={(point) => {
          if (mapPickMode === 'route-origin') {
            routePlanner.chooseOrigin(point, 'Map point');
            routePlanner.build();
            setMapPickMode('search');
          } else {
            void chooseMapPoint(point);
          }
        }}
        onMarkerDrag={(id, point) => {
          if (id === 'search-anchor') void chooseMapPoint(point);
          if (id === 'route-origin')
            routePlanner.chooseOrigin(point, 'Map point');
        }}
        onMarkerClick={selectMarker}
        className="absolute inset-0 h-full w-full rounded-none border-0"
      />

      <div className="pointer-events-none absolute inset-y-3 left-3 right-14 z-20 flex flex-col gap-3">
        <section
          aria-label="Search events"
          className="pointer-events-auto max-h-[min(42dvh,420px)] shrink-0 space-y-2 overflow-y-auto rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm lg:max-h-[45dvh] lg:overflow-y-auto"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500">
                Discover
              </p>
              <h1>Explore events</h1>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/events/new">Create event</Link>
            </Button>
          </div>
          <EventSearchToolbar
            text={text}
            onTextChange={setText}
            categories={categories}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            sort={sort}
            onSortChange={setSort}
            canSortByDistance={Boolean(anchor)}
            canSortByRelevance={Boolean(searchText)}
            onUseLocation={() => void useMyLocation()}
          />
          {mode === 'DEVICE' && permission !== 'granted' && !userLocation && (
            <p className="text-xs text-neutral-600">
              Location is paused. Choose “Use my location” to try again, or
              enter a place.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-200 pt-2 text-xs">
            <span className="font-semibold text-neutral-700">
              {locationLabel}
              {anchor ? ` · ${radiusKm} km` : ''}
            </span>
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => setMapPickMode('search')}
            >
              Pick search point
            </button>
          </div>
          {anchor && (
            <p className="text-xs text-neutral-600">
              Results use the displayed map position. Hidden venues use an
              approximate position, so their actual distance may differ.
            </p>
          )}
          <EventLocationFilters
            placeQuery={placeQuery}
            onPlaceQueryChange={changePlace}
            placeKind={placeKind}
            onPlaceKindChange={changePlaceKind}
            onPlaceSelect={(point, label) => void choosePlace(point, label)}
            locationActive={Boolean(anchor && anchorSource)}
            canClearLocation={Boolean(anchor) || needsLocation}
            radiusKm={radiusKm}
            onRadiusChange={setRadiusKm}
            startFrom={startFrom}
            onStartFromChange={setStartFrom}
            startTo={startTo}
            onStartToChange={setStartTo}
            status={status}
            onStatusChange={setStatus}
            onClearLocation={() => void clearLocation()}
          />
          {routePlanner.destination && (
            <ExploreRouteControls
              eventTitle={routePlanner.destination.title}
              origin={routePlanner.origin}
              originLabel={routePlanner.originLabel}
              onOriginLabelChange={routePlanner.changeOriginLabel}
              onOriginChange={(point, label) => {
                routePlanner.chooseOrigin(point, label);
                setMapPickMode('search');
              }}
              mode={routePlanner.mode}
              onModeChange={routePlanner.setMode}
              onUseLocation={() => {
                setMapPickMode('search');
                void routePlanner.useCurrentLocation();
              }}
              onUseSearchCenter={
                anchor
                  ? () => {
                      routePlanner.chooseOrigin(anchor, locationLabel);
                      setMapPickMode('search');
                    }
                  : undefined
              }
              onPickOnMap={() => setMapPickMode('route-origin')}
              onBuild={routePlanner.build}
              onClear={clearRoute}
              route={routePlanner.route}
              loading={routePlanner.loading}
            />
          )}
          {mapPickMode === 'route-origin' && (
            <p
              role="status"
              className="rounded-md bg-neutral-900 px-3 py-2 text-xs text-white"
            >
              Click the map to set the route start.
            </p>
          )}
          <details className="text-xs text-neutral-600">
            <summary className="cursor-pointer font-semibold text-neutral-700">
              Location privacy
            </summary>
            <p className="mt-2 leading-5">
              GPS is requested only when you choose it. Your position is used
              for the current search and is not saved to your profile or search
              history. Map tiles come from OpenFreeMap and OpenStreetMap; place
              suggestions come from Photon. Building a route sends its endpoints
              to Transitland Valhalla.
            </p>
          </details>
        </section>
        <div
          className={`pointer-events-auto absolute bottom-0 left-0 w-[min(390px,100%)] h-[min(34dvh,300px)] min-h-[120px] ${resultsOpen ? 'flex' : 'hidden'} lg:static lg:flex lg:h-auto lg:min-h-0 lg:flex-1`}
        >
          <ExploreResultsPanel
            items={items}
            selectedId={selectedId}
            selectedRegion={selectedRegion}
            loading={loading}
            error={error}
            cursor={cursor}
            onSelect={selectEvent}
            onRoute={(id) => void chooseRouteEvent(id)}
            onLoadMore={(next) => void load(next)}
            onClose={() => setResultsOpen(false)}
            needsLocation={needsLocation}
          />
        </div>
      </div>

      {selectedEvent && !routePlanner.destination && (
        <aside
          aria-label="Selected event"
          className={`pointer-events-auto absolute bottom-16 left-3 z-20 w-[min(320px,calc(100%-24px))] rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm lg:bottom-4 lg:left-auto lg:right-4 lg:w-72 ${resultsOpen ? 'hidden lg:block' : 'block'}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Selected event
          </p>
          <h2 className="mt-1 text-lg font-semibold">{selectedEvent.title}</h2>
          <p className="mt-1 text-xs text-neutral-600">
            {selectedEvent.location.region || 'Location not listed'}
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => void chooseRouteEvent(selectedEvent.id)}
            >
              Build route
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/events/${selectedEvent.id}`}>View event</Link>
            </Button>
          </div>
        </aside>
      )}
      {routePlanner.destination &&
        (routePlanner.loading || routePlanner.route) && (
          <aside
            aria-label="Route summary"
            className={`pointer-events-auto absolute bottom-16 left-3 z-20 w-[min(320px,calc(100%-24px))] rounded-xl border border-neutral-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm lg:bottom-4 lg:left-auto lg:right-4 lg:w-72 ${resultsOpen ? 'hidden lg:block' : 'block'}`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              Route to {routePlanner.destination.title}
            </p>
            {routePlanner.loading ? (
              <p role="status" className="mt-2 text-sm">
                Building route…
              </p>
            ) : routePlanner.route ? (
              <p className="mt-2 text-lg font-semibold">
                {(routePlanner.route.distanceMeters / 1000).toFixed(1)} km ·
                About{' '}
                {Math.max(
                  1,
                  Math.round(routePlanner.route.durationSeconds / 60),
                )}{' '}
                min
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={clearRoute}
            >
              Clear route
            </Button>
          </aside>
        )}
      {!resultsOpen && (
        <button
          type="button"
          className="absolute bottom-3 left-3 z-30 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold shadow-lg lg:hidden"
          onClick={() => setResultsOpen(true)}
        >
          Events ({items.length})
        </button>
      )}
      <p className="sr-only">
        Your position is requested only when you choose Use my location. It is
        not saved to your profile or search history. Map tiles come from
        OpenFreeMap and OpenStreetMap. Place suggestions come from Photon.
        {accuracy !== null &&
          userLocation &&
          ` Position accuracy: about ${accuracy} meters.`}
      </p>
    </div>
  );
}
