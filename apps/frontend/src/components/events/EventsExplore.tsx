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
import { ExploreSearchPanel } from './ExploreSearchPanel';
import { ExploreViewSwitch, type ExploreView } from './ExploreViewSwitch';
import { ExploreSplitDivider } from './ExploreSplitDivider';
import { ExploreRouteControls } from './ExploreRouteControls';
import { useExploreRoute } from './useExploreRoute';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { PublicLanding } from './PublicLanding';

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
  const [organizerId, setOrganizerId] = useState('');
  const [organizerQuery, setOrganizerQuery] = useState('');
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
  const [view, setView] = useState<ExploreView>('list');
  const [splitAvailable, setSplitAvailable] = useState(false);
  const [areaWidth, setAreaWidth] = useState(0);
  const [preferredListWidth, setPreferredListWidth] = useState<number | null>(
    null,
  );
  const [mapMoved, setMapMoved] = useState(false);
  const [viewportPoint, setViewportPoint] = useState<MapPoint | null>(null);
  const [routeControlsOpen, setRouteControlsOpen] = useState(true);
  const areaRef = useRef<HTMLDivElement>(null);
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
    const media = window.matchMedia('(min-width: 768px)');
    setView(media.matches ? 'split' : 'list');
    const changed = () => {
      if (!media.matches)
        setView((current) => (current === 'split' ? 'list' : current));
    };
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);

  useEffect(() => {
    if (!areaRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      setAreaWidth(width);
      const available =
        width >= 680 && window.matchMedia('(min-width: 768px)').matches;
      setSplitAvailable(available);
      if (!available)
        setView((current) => (current === 'split' ? 'list' : current));
    });
    observer.observe(areaRef.current);
    return () => observer.disconnect();
  }, [authLoading, user?.id]);

  useEffect(() => setMapMoved(false), [anchor?.latitude, anchor?.longitude]);

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
        setError('');
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
        ...(organizerId ? { organizerId } : {}),
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
      } finally {
        if (current === requestId.current) setLoading(false);
      }
    },
    [
      user?.id,
      searchText,
      categoryId,
      organizerId,
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
        avatarUrl: `/backend/api/storage/events/${item.id}/avatar`,
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
              kind: 'search' as const,
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
              kind: 'route' as const,
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
              avatarUrl: `/backend/api/storage/events/${routePlanner.destination.id}/avatar`,
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
    setView((current) =>
      current === 'list' ? (splitAvailable ? 'split' : 'map') : current,
    );
    setRouteControlsOpen(true);
    if (!routePlanner.origin && anchor) {
      routePlanner.chooseOrigin(
        anchor,
        anchorSource === 'DEVICE' ? 'Current location' : 'Search center',
      );
    }
    if (routePlanner.origin || anchor) {
      routePlanner.build();
      setMapPickMode('search');
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

  async function chooseMapPoint(point: MapPoint, preserveView = false) {
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
    setPlaceQuery('');
    setAnchorLabel('');
    if (!preserveView) {
      setCenter(point);
      setZoom((current) => Math.max(current, 11));
    }
    setMapMoved(false);
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
      if (view === 'list') setView(splitAvailable ? 'split' : 'map');
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

  const selectedMarker = selectedEvent
    ? markers.find((marker) => marker.id === selectedEvent.id)
    : undefined;
  const listWidth = Math.min(
    Math.max(320, preferredListWidth ?? Math.min(440, areaWidth * 0.35)),
    Math.max(320, areaWidth - 332),
  );

  if (authLoading) return <Loading />;
  if (!user) return <PublicLanding />;

  const searchProps = {
    view,
    text,
    onTextChange: setText,
    categories,
    categoryId,
    onCategoryChange: setCategoryId,
    organizerId,
    organizerQuery,
    onOrganizerQueryChange: (value: string) => {
      setOrganizerQuery(value);
      setOrganizerId('');
    },
    onOrganizerSelect: (id: string, label: string) => {
      setOrganizerId(id);
      setOrganizerQuery(label);
    },
    sort,
    onSortChange: setSort,
    canSortByDistance: Boolean(anchor),
    canSortByRelevance: Boolean(searchText),
    placeQuery,
    onPlaceQueryChange: changePlace,
    placeKind,
    onPlaceKindChange: changePlaceKind,
    onPlaceSelect: (point: MapPoint, label: string) =>
      void choosePlace(point, label),
    locationActive: Boolean(anchor && anchorSource),
    canClearLocation: Boolean(anchor) || needsLocation,
    locationLabel,
    radiusKm,
    onRadiusChange: setRadiusKm,
    startFrom,
    onStartFromChange: setStartFrom,
    startTo,
    onStartToChange: setStartTo,
    status,
    onStatusChange: setStatus,
    onClearFilters: () => {
      setText('');
      setSearchText('');
      setCategoryId('');
      setOrganizerId('');
      setOrganizerQuery('');
      setStartFrom('');
      setStartTo('');
      setStatus('');
      setSort('start_time');
    },
    onClearLocation: () => void clearLocation(),
    onUseLocation: () => void useMyLocation(),
    onPickMap: () => {
      setMapPickMode('search');
      if (view === 'list') setView(splitAvailable ? 'split' : 'map');
      show('Click the map to choose a search point.', 'info');
    },
  };

  return (
    <div className="events-explore-fullscreen flex h-[calc(100dvh-61px)] flex-col gap-2 overflow-hidden p-3 lg:h-dvh">
      <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
            Discover
          </p>
          <h1>Explore events</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExploreViewSwitch
            view={view}
            splitAvailable={splitAvailable}
            onChange={setView}
          />
          <Button asChild size="sm">
            <Link href="/events/new">Create event</Link>
          </Button>
        </div>
      </header>
      {view !== 'map' && <ExploreSearchPanel {...searchProps} />}
      <div ref={areaRef} className="relative flex min-h-0 min-w-0 flex-1">
        {view !== 'map' && (
          <div
            className="flex min-h-0 min-w-0"
            style={view === 'split' ? { width: listWidth } : { width: '100%' }}
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
              onRetry={() =>
                void load(items.length && cursor ? cursor : undefined)
              }
              needsLocation={needsLocation}
              grid={view === 'list'}
            />
          </div>
        )}
        {view === 'split' && splitAvailable && (
          <ExploreSplitDivider
            width={listWidth}
            min={320}
            max={Math.max(320, areaWidth - 332)}
            onChange={setPreferredListWidth}
          />
        )}
        <section
          aria-label="Event map"
          className={`relative min-h-0 min-w-0 flex-1 ${view === 'list' ? 'hidden' : ''}`}
        >
          <MapView
            center={center}
            zoom={zoom}
            markers={markers}
            radius={
              anchor
                ? { center: anchor, radiusMeters: radiusKm * 1000 }
                : undefined
            }
            route={routePoints}
            exploreLayout
            visible={view !== 'list'}
            selectedPopup={
              selectedEvent && selectedMarker
                ? {
                    id: selectedEvent.id,
                    title: selectedEvent.title,
                    point: selectedMarker,
                    approximate: Boolean(selectedMarker.approximate),
                  }
                : null
            }
            onPopupRoute={(id) => void chooseRouteEvent(id)}
            onPopupClose={() => setSelectedId(null)}
            onViewportChange={(point) => {
              setViewportPoint(point);
              setMapMoved(true);
            }}
            onPick={(point) => {
              if (mapPickMode === 'route-origin') {
                routePlanner.chooseOrigin(point, 'Map point');
                routePlanner.build();
                setMapPickMode('search');
              } else void chooseMapPoint(point);
            }}
            onMarkerDrag={(id, point) => {
              if (id === 'search-anchor') void chooseMapPoint(point);
              if (id === 'route-origin')
                routePlanner.chooseOrigin(point, 'Map point');
            }}
            onMarkerClick={selectMarker}
            className="absolute inset-0 h-full w-full"
          />
          {view === 'map' && (
            <div className="pointer-events-none absolute left-3 right-3 top-3 z-20">
              <div className="pointer-events-auto w-[min(620px,calc(100%-5rem))]">
                <ExploreSearchPanel {...searchProps} />
              </div>
            </div>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute right-3 top-24 z-10 bg-white shadow-sm"
            onClick={() => void useMyLocation()}
          >
            My location
          </Button>
          {mapPickMode === 'route-origin' && (
            <p
              role="status"
              className="pointer-events-none absolute left-3 top-16 z-10 rounded-lg bg-neutral-900 px-3 py-2 text-xs text-white"
            >
              Click the map to set the route start.
            </p>
          )}
          {mapMoved && viewportPoint && (
            <Button
              type="button"
              className="absolute bottom-10 left-1/2 z-10 -translate-x-1/2 shadow-lg"
              onClick={() => void chooseMapPoint(viewportPoint, true)}
            >
              Search this area
            </Button>
          )}
          {routePlanner.destination && (
            <details
              open={routeControlsOpen}
              onToggle={(event) =>
                setRouteControlsOpen(event.currentTarget.open)
              }
              className="absolute bottom-10 right-3 z-20 max-h-[min(60dvh,500px)] w-[min(420px,calc(100%-24px))] overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-lg"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                Route to {routePlanner.destination.title}
                {routePlanner.route &&
                  ` · ${(routePlanner.route.distanceMeters / 1000).toFixed(1)} km · ${Math.max(1, Math.round(routePlanner.route.durationSeconds / 60))} min`}
              </summary>
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
                onPickOnMap={() => {
                  setMapPickMode('route-origin');
                  setRouteControlsOpen(false);
                }}
                onBuild={routePlanner.build}
                onClear={clearRoute}
                route={routePlanner.route}
                error={routePlanner.error}
                loading={routePlanner.loading}
              />
            </details>
          )}
        </section>
      </div>
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
