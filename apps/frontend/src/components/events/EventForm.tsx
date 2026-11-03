'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreateEventSchema,
  UpdateEventSchema,
  type EventDetail,
  type EventVisibility,
} from '@event-sharing/contracts';
import { eventsClient, type Category } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { placesClient } from '@/lib/api/PlacesClient';
import { useAuth } from '@/contexts/AuthContext';
import { MapView, type MapPoint } from '@/components/map/MapView';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { Notice } from '@/components/feedback/Notice';
import { Loading } from '@/components/feedback/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { eventLocalTime, eventUtcTime } from '@/lib/event-time';
import { InviteParticipants } from './InviteParticipants';
import { invitationClient } from '@/lib/api/InvitationClient';
import { useToast } from '@/contexts/ToastContext';
import {
  ChatGroupDraftForm,
  type ChatGroupDraft,
} from '@/components/messages/ChatGroupDraftForm';
import { messagesClient } from '@/lib/api/MessagesClient';

const timeZones = [
  'UTC',
  ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC'),
];

export function EventForm({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [existing, setExisting] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeZone, setTimeZone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  );
  const [address, setAddress] = useState('');
  const [region, setRegion] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [visibility, setVisibility] = useState<'PUBLIC' | 'PARTICIPANTS_ONLY'>(
    'PARTICIPANTS_ONLY',
  );
  const [participantLimit, setParticipantLimit] = useState('20');
  const [chatEnabled, setChatEnabled] = useState(false);
  const [chatGroups, setChatGroups] = useState<ChatGroupDraft[]>([]);
  const [eventVisibility, setEventVisibility] =
    useState<EventVisibility>('PUBLIC');
  const [invitees, setInvitees] = useState<string[]>([]);
  const [mapCenter, setMapCenter] = useState<MapPoint>({
    latitude: 20,
    longitude: 0,
  });
  const [mapZoom, setMapZoom] = useState(2);
  const pointChosen = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const [loadedCategories, event] = await Promise.all([
          eventsClient.categories(),
          eventId ? eventsClient.get(eventId) : Promise.resolve(null),
        ]);
        setCategories(loadedCategories);
        if (event) {
          setExisting(event);
          setTitle(event.title);
          setDescription(event.description);
          setCategoryId(event.categoryId ?? '');
          setTimeZone(event.timeZone);
          setStartTime(eventLocalTime(event.startTime, event.timeZone));
          setEndTime(eventLocalTime(event.endTime, event.timeZone));
          setAddress(event.location.address ?? '');
          setRegion(event.location.region ?? '');
          setLatitude(String(event.location.latitude ?? ''));
          setLongitude(String(event.location.longitude ?? ''));
          if (
            event.location.latitude !== null &&
            event.location.longitude !== null
          ) {
            pointChosen.current = true;
            setMapCenter({
              latitude: event.location.latitude,
              longitude: event.location.longitude,
            });
            setMapZoom(14);
          }
          setVisibility(event.location.visibility);
          setParticipantLimit(String(event.participantLimit));
          setEventVisibility(event.visibility);
          setChatEnabled(event.chatEnabled);
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : 'Could not load the form.',
        );
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [eventId]);

  useEffect(() => {
    if (eventId || !user) return;
    usersClient
      .me()
      .then(async (profile) => {
        if (!profile.city) return;
        const [place] = await placesClient.search(profile.city, 'city');
        if (place && !pointChosen.current) {
          setRegion((current) => current || profile.city || '');
          setMapCenter({
            latitude: place.latitude,
            longitude: place.longitude,
          });
          setMapZoom(11);
        }
      })
      .catch(() => undefined);
  }, [eventId, user?.id]);

  function choosePoint(point: MapPoint) {
    pointChosen.current = true;
    setLatitude(point.latitude.toFixed(6));
    setLongitude(point.longitude.toFixed(6));
    setMapCenter(point);
    setMapZoom(15);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (!latitude.trim() || !longitude.trim()) {
        throw new Error('Choose a venue point on the map before saving.');
      }
      const input = {
        title,
        description,
        categoryId: categoryId || null,
        startTime: eventUtcTime(startTime, timeZone),
        endTime: eventUtcTime(endTime, timeZone),
        timeZone,
        location: {
          address,
          region,
          latitude: Number(latitude),
          longitude: Number(longitude),
          visibility,
        },
        participantLimit: Number(participantLimit),
        chatEnabled,
        visibility: eventVisibility,
      };
      if (eventId) {
        const patch = UpdateEventSchema.parse({
          ...input,
          participantLimit:
            Number(participantLimit) === existing?.participantLimit
              ? undefined
              : Number(participantLimit),
        });
        await eventsClient.update(eventId, patch);
        router.push(`/events/${eventId}`);
      } else {
        const created = await eventsClient.create(
          CreateEventSchema.parse(input),
        );
        const allInvitees = [
          ...new Set([
            ...invitees,
            ...chatGroups.flatMap((group) =>
              group.members.map((member) => member.username),
            ),
          ]),
        ];
        if (allInvitees.length) {
          try {
            await invitationClient.send(created.id, allInvitees);
          } catch {
            show(
              'Event created, but invitations could not be sent. Try again from the event page.',
              'warning',
            );
          }
        }
        if (chatEnabled) {
          for (const group of chatGroups) {
            try {
              await messagesClient.createRoom(created.id, {
                name: group.name,
                access: group.access,
                memberIds: group.members.map((member) => member.userId),
              });
            } catch {
              show(
                `Event created, but group ${group.name} could not be saved. Add it from the event page.`,
                'warning',
              );
            }
          }
        }
        router.push(`/events/${created.id}`);
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save event.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading event form…" />;
  if (eventId && !existing)
    return (
      <div className="space-y-4">
        <Notice message={error || 'Event not found.'} tone="error" />
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  if (
    existing &&
    user &&
    existing.organizerId !== user.id &&
    user.role !== 'ADMIN'
  )
    return (
      <div className="space-y-4">
        <Notice message="You cannot edit this event." tone="error" />
        <Button
          variant="outline"
          onClick={() => router.push(`/events/${eventId}`)}
        >
          Back to event
        </Button>
      </div>
    );

  const venuePoint =
    latitude.trim() && longitude.trim()
      ? { latitude: Number(latitude), longitude: Number(longitude) }
      : null;
  const validVenuePoint =
    venuePoint &&
    Number.isFinite(venuePoint.latitude) &&
    Number.isFinite(venuePoint.longitude) &&
    venuePoint.latitude >= -90 &&
    venuePoint.latitude <= 90 &&
    venuePoint.longitude >= -180 &&
    venuePoint.longitude <= 180;

  return (
    <>
      <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8">
          <h2>Event details</h2>
          <div>
            <label htmlFor="title">Title</label>
            <Input
              id="title"
              required
              maxLength={160}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="description">Description</label>
            <Textarea
              id="description"
              required
              maxLength={10000}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="category">Category</label>
            <select
              id="category"
              className="w-full"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="start">Start</label>
              <Input
                id="start"
                type="datetime-local"
                required
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
            <div>
              <label htmlFor="end">End</label>
              <Input
                id="end"
                type="datetime-local"
                required
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="event-time-zone">Event time zone</label>
            <select
              id="event-time-zone"
              className="w-full"
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="limit">Participant limit</label>
            <Input
              id="limit"
              type="number"
              min={1}
              step={1}
              required
              value={participantLimit}
              onChange={(event) => setParticipantLimit(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="event-visibility">
              Who can discover this event
            </label>
            <select
              id="event-visibility"
              className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2"
              value={eventVisibility}
              onChange={(event) =>
                setEventVisibility(event.target.value as EventVisibility)
              }
              disabled={Boolean(
                existing &&
                existing.status !== 'DRAFT' &&
                existing.status !== 'REJECTED' &&
                existing.status !== 'APPROVED',
              )}
            >
              <option value="PUBLIC">Public search and direct link</option>
              <option value="UNLISTED">Direct link only</option>
              <option value="INVITE_ONLY">Invitation required</option>
            </select>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={chatEnabled}
              onChange={(event) => setChatEnabled(event.target.checked)}
            />
            Enable event chats for registered participants
          </label>
          {chatEnabled && !eventId && (
            <ChatGroupDraftForm groups={chatGroups} onChange={setChatGroups} />
          )}
        </div>
        <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8">
          <h2>Location</h2>
          <p className="text-sm leading-6 text-neutral-600">
            Find a city and address, then choose the precise venue point on the
            map. You can adjust the pin by clicking anywhere on the map.
          </p>
          <PlaceAutocomplete
            id="region"
            label="City or region"
            kind="city"
            value={region}
            onChange={setRegion}
            onSelect={(place) => {
              setRegion((place.region ?? place.label).slice(0, 100));
              setMapCenter({
                latitude: place.latitude,
                longitude: place.longitude,
              });
              setMapZoom(12);
            }}
            placeholder="Start typing a city"
          />
          <PlaceAutocomplete
            id="address"
            label="Venue address"
            kind="address"
            context={region}
            value={address}
            onChange={setAddress}
            onSelect={(place) => {
              setAddress(place.address);
              if (place.region) setRegion(place.region.slice(0, 100));
              choosePoint({
                latitude: place.latitude,
                longitude: place.longitude,
              });
            }}
            placeholder="Start typing a street or venue"
            required
          />
          <MapView
            center={mapCenter}
            zoom={mapZoom}
            markers={
              validVenuePoint
                ? [
                    {
                      id: 'venue',
                      label: 'Selected venue',
                      ...venuePoint,
                      selected: true,
                    },
                  ]
                : []
            }
            onPick={choosePoint}
            className="h-[390px]"
          />
          <p className="text-sm text-neutral-600">
            {latitude && longitude
              ? `Selected point: ${latitude}, ${longitude}`
              : 'Click the map or select an address suggestion to set the venue point.'}
          </p>
          <details className="rounded-md border border-neutral-200 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Enter coordinates manually
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="latitude">Latitude</label>
                <Input
                  id="latitude"
                  type="number"
                  min={-90}
                  max={90}
                  step="any"
                  value={latitude}
                  onChange={(event) => setLatitude(event.target.value)}
                />
              </div>
              <div>
                <label htmlFor="longitude">Longitude</label>
                <Input
                  id="longitude"
                  type="number"
                  min={-180}
                  max={180}
                  step="any"
                  value={longitude}
                  onChange={(event) => setLongitude(event.target.value)}
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                const lat = Number(latitude);
                const lon = Number(longitude);
                if (
                  latitude.trim() &&
                  longitude.trim() &&
                  lat >= -90 &&
                  lat <= 90 &&
                  lon >= -180 &&
                  lon <= 180
                ) {
                  pointChosen.current = true;
                  setMapCenter({ latitude: lat, longitude: lon });
                  setMapZoom(15);
                  setError('');
                } else
                  setError('Enter valid coordinates before placing the pin.');
              }}
            >
              Show on map
            </Button>
          </details>
          <div>
            <label htmlFor="visibility">Location visibility</label>
            <select
              id="visibility"
              className="w-full"
              value={visibility}
              onChange={(event) =>
                setVisibility(event.target.value as typeof visibility)
              }
            >
              <option value="PARTICIPANTS_ONLY">
                Registered participants only
              </option>
              <option value="PUBLIC">Public while the event is active</option>
            </select>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Organizers and administrators can always see the location. Private
              locations become visible to registered participants after the
              registration event is processed.
            </p>
          </div>
          <p className="text-xs leading-5 text-neutral-500">
            Search terms are sent to Photon for suggestions. Moving the pin does
            not send its exact coordinates to Photon. Map tiles are provided by
            OpenFreeMap.
          </p>
          {existing?.pendingStatus && (
            <Notice
              message="A registration change is still being processed. Wait for it to finish before editing."
              tone="warning"
            />
          )}
          {error && <Notice message={error} tone="error" />}
          <Button
            className="w-full"
            disabled={busy || Boolean(existing?.pendingStatus)}
          >
            {busy ? 'Saving…' : eventId ? 'Save changes' : 'Create draft'}
          </Button>
        </div>
      </form>
      <InviteParticipants eventId={eventId} onSelectionChange={setInvitees} />
    </>
  );
}
