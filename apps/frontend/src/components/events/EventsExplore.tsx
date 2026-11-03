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
import { ExploreEventItem } from './ExploreEventItem';
import { EventSearchToolbar } from './EventSearchToolbar';
import { EventLocationFilters } from './EventLocationFilters';
import { EventViewSwitch } from './EventViewSwitch';
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
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [panelMode, setPanelMode] = useState<'search' | 'route'>('search');
  const [mapPickMode, setMapPickMode] = useState<'search' | 'route-origin'>(
    'search',
  );
  const routePlanner = useExploreRoute(user?.id, requestPosition);
  const requestId = useRef(0);
  const locationRequestId = useRef(0);
  const locationSelected = useRef(false);

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
          ? { startTo: new Date(`${startTo}T23:59:59`).toISOString() }
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
          !(panelMode === 'route' && item.id === routePlanner.destination?.id),
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
      ...(panelMode === 'search' && anchor && anchorSource !== 'DEVICE'
        ? [
            {
              id: 'search-anchor',
              label: 'Search center. Drag to move it.',
              ...anchor,
              draggable: true,
            },
          ]
        : []),
      ...(panelMode === 'route' && routePlanner.origin
        ? [
            {
              id: 'route-origin',
              label: 'Route start. Drag to move it.',
              ...routePlanner.origin,
              draggable: true,
            },
          ]
        : []),
      ...(panelMode === 'route' && routePlanner.destination
        ? [
            {
              id: 'route-destination',
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
    panelMode,
    routePlanner.origin,
    routePlanner.destination,
  ]);

  async function chooseRouteEvent(id: string) {
    setPanelMode('route');
    setMapPickMode('route-origin');
    const destination = await routePlanner.chooseEvent(id);
    if (!destination) return;
    setSelectedId(id);
    setCenter(destination.point);
    setZoom(11);
    setMobileView('map');
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
    setCenter(point);
    setZoom(11);
    setSort('distance');
  }

  function changePlace(value: string) {
    locationRequestId.current++;
    locationSelected.current = true;
    setPlaceQuery(value);
    setAnchor(null);
    setAnchorSource(null);
    setUserLocation(null);
    setAccuracy(null);
    if (sort === 'distance') setSort('start_time');
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
    setSort('start_time');
    setCenter(worldCenter);
    setZoom(2);
  }

  function selectEvent(item: SearchEvent) {
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
      setMobileView('map');
    } else show('This event has no map position yet.', 'info');
  }

  function selectMarker(id: string) {
    if (id === 'route-destination') return;
    if (panelMode === 'route' && !id.startsWith('city:')) {
      void chooseRouteEvent(id);
      return;
    }
    if (id.startsWith('city:')) {
      const region = id.slice(5);
      setSelectedRegion(region);
      setSelectedId(null);
    } else {
      setSelectedId(id);
      setSelectedRegion(null);
      requestAnimationFrame(() =>
        document
          .getElementById(`event-result-${id}`)
          ?.scrollIntoView({ block: 'nearest' }),
      );
    }
    setMobileView('list');
  }

  if (authLoading) return <Loading />;
  if (!user)
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(240px,340px)_minmax(0,1fr)]">
        <div className="h-fit space-y-5 rounded-xl border border-neutral-200 bg-white p-6">
          <h2>Find your next event</h2>
          <p className="text-sm text-neutral-600">
            Sign in to search events, use your location, and plan a route.
          </p>
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </div>
        <MapView
          center={worldCenter}
          zoom={2}
          markers={[]}
          className="h-[min(72dvh,760px)] min-h-[440px]"
        />
      </div>
    );

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Map tools"
        className="inline-flex rounded-lg border border-neutral-200 bg-white p-1"
      >
        <button
          type="button"
          aria-pressed={panelMode === 'search'}
          className={`rounded-md px-4 py-2 text-sm ${panelMode === 'search' ? 'bg-black text-white' : 'text-neutral-600'}`}
          onClick={() => {
            setPanelMode('search');
            setMapPickMode('search');
          }}
        >
          Search
        </button>
        <button
          type="button"
          aria-pressed={panelMode === 'route'}
          className={`rounded-md px-4 py-2 text-sm ${panelMode === 'route' ? 'bg-black text-white' : 'text-neutral-600'}`}
          onClick={() => {
            setPanelMode('route');
            setMapPickMode('route-origin');
          }}
        >
          Route
        </button>
      </div>
      {panelMode === 'search' ? (
        <>
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
            <p className="rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-700">
              Current location is paused. Choose “Use my location” to try again,
              or search around a city. Browser permission: {permission}.
            </p>
          )}
          <EventLocationFilters
            placeQuery={placeQuery}
            onPlaceQueryChange={changePlace}
            placeKind={placeKind}
            onPlaceKindChange={changePlaceKind}
            onPlaceSelect={(point, label) => void choosePlace(point, label)}
            locationActive={Boolean(anchor && anchorSource)}
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
          <p className="text-xs text-neutral-600">
            {anchor && anchorSource
              ? `Search center: ${anchorSource === 'DEVICE' ? 'GPS' : anchorSource === 'MAP' ? 'Map point' : placeQuery || anchorSource.toLowerCase()}; radius: ${radiusKm} km.`
              : 'Searching everywhere. Click the map to search around a point.'}
            {categoryId &&
              ` Category: ${categories.find((category) => category.id === categoryId)?.name ?? 'Uncategorized'}.`}
            {anchor &&
              ' Approximate event locations may appear just outside the circle.'}
          </p>
        </>
      ) : (
        <ExploreRouteControls
          eventTitle={routePlanner.destination?.title ?? null}
          origin={routePlanner.origin}
          originLabel={routePlanner.originLabel}
          onOriginLabelChange={routePlanner.changeOriginLabel}
          onOriginChange={routePlanner.chooseOrigin}
          mode={routePlanner.mode}
          onModeChange={routePlanner.setMode}
          onUseLocation={() => void routePlanner.useCurrentLocation()}
          onPickOnMap={() => {
            setMapPickMode('route-origin');
            setMobileView('map');
          }}
          onBuild={routePlanner.build}
          onClear={clearRoute}
          route={routePlanner.route}
          loading={routePlanner.loading}
          error={routePlanner.error}
        />
      )}
      <EventViewSwitch view={mobileView} onChange={setMobileView} />
      <div className="grid gap-4 lg:grid-cols-[minmax(340px,440px)_minmax(0,1fr)]">
        <section
          aria-label="Search results"
          className={`flex h-[min(70dvh,760px)] min-h-[440px] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white ${mobileView === 'map' ? 'hidden lg:flex' : 'flex'}`}
        >
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="text-lg font-semibold">Events</h2>
            <span className="text-sm text-neutral-500">
              {items.length} shown
            </span>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
            {loading && !items.length ? (
              <Loading label="Searching events…" />
            ) : items.length ? (
              items.map((item) => (
                <ExploreEventItem
                  key={item.id}
                  event={item}
                  selected={
                    selectedId === item.id ||
                    Boolean(
                      selectedRegion && selectedRegion === item.location.region,
                    )
                  }
                  onSelect={() => selectEvent(item)}
                  onRoute={() => void chooseRouteEvent(item.id)}
                />
              ))
            ) : (
              <p className="p-4 text-sm text-neutral-600">
                {error
                  ? 'Search is temporarily unavailable.'
                  : 'No events match these filters. Try a wider area or another date.'}
              </p>
            )}
            {cursor && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={loading}
                onClick={() => void load(cursor)}
              >
                {loading ? 'Loading…' : 'Load more'}
              </Button>
            )}
          </div>
        </section>
        <section
          aria-label="Event map"
          className={`relative ${mobileView === 'list' ? 'hidden lg:block' : 'block'}`}
        >
          <p className="pointer-events-none absolute left-3 top-3 z-10 max-w-[15rem] rounded bg-white/95 px-3 py-2 text-xs text-neutral-800 shadow-sm">
            {panelMode === 'route'
              ? mapPickMode === 'route-origin'
                ? 'Click the map to choose the route start.'
                : 'Choose an event to plan a route.'
              : anchorSource === 'DEVICE'
                ? 'Click the map to search from another point.'
                : anchor
                  ? 'Drag the search marker or click another point.'
                  : 'Click the map to search for nearby events.'}
          </p>
          <MapView
            center={center}
            zoom={zoom}
            markers={markers}
            radius={
              anchor && panelMode === 'search'
                ? { center: anchor, radiusMeters: radiusKm * 1000 }
                : undefined
            }
            route={
              panelMode === 'route'
                ? routePlanner.route?.coordinates.map(
                    ([longitude, latitude]) => ({
                      latitude,
                      longitude,
                    }),
                  )
                : undefined
            }
            onPick={(point) => {
              if (panelMode === 'route') {
                routePlanner.chooseOrigin(point, 'Map point');
              } else void chooseMapPoint(point);
            }}
            onMarkerDrag={(id, point) => {
              if (id === 'search-anchor') void chooseMapPoint(point);
              if (id === 'route-origin') {
                routePlanner.chooseOrigin(point, 'Map point');
              }
            }}
            onMarkerClick={selectMarker}
            visible={mobileView === 'map'}
            className="h-[min(70dvh,760px)] min-h-[440px]"
          />
        </section>
      </div>
      <p className="text-xs leading-5 text-neutral-600">
        Select a place above, click the map, or drag the search marker to find
        nearby events. Your position is requested only when you choose “Use my
        location”. It is not saved to your profile or search history; the search
        service receives it for the current request. The map provider receives
        tile requests for the area you view. Private venues appear at
        approximate city positions. Map tiles: OpenFreeMap and OpenStreetMap.
        Place searches are sent to Photon for suggestions.
        {accuracy !== null &&
          userLocation &&
          ` Position accuracy: about ${accuracy} m.`}
      </p>
    </div>
  );
}
