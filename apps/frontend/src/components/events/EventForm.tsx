'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  CreateEventSchema,
  EventLocationSchema,
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
import { Switch } from '@/components/ui/switch';
import { eventLocalTime, eventUtcTime } from '@/lib/event-time';
import { InviteParticipants } from './InviteParticipants';
import { invitationClient } from '@/lib/api/InvitationClient';
import { useToast } from '@/contexts/ToastContext';
import {
  ChatGroupDraftForm,
  type ChatGroupDraft,
} from '@/components/messages/ChatGroupDraftForm';
import { messagesClient } from '@/lib/api/MessagesClient';
import { EVENT_FORM_STEPS, EventStepNavigation } from './EventStepNavigation';
import { storageClient, type EventImageSlot } from '@/lib/api/StorageClient';
import { EventImage } from './EventImage';

const timeZones = [
  'UTC',
  ...Intl.supportedValuesOf('timeZone').filter((zone) => zone !== 'UTC'),
];

export function EventForm({
  eventId,
  copyFromId,
}: {
  eventId?: string;
  copyFromId?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { show } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [existing, setExisting] = useState<EventDetail | null>(null);
  const [copySource, setCopySource] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(0);
  const [reachedStep, setReachedStep] = useState(0);
  const submitLock = useRef(false);
  const stepContent = useRef<HTMLDivElement>(null);
  const stepVisited = useRef(false);
  const [title, setTitle] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [eventImages, setEventImages] = useState<
    Record<EventImageSlot, boolean>
  >({ avatar: false, cover: false });
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [removeCover, setRemoveCover] = useState(false);
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
  const reverseRequest = useRef<AbortController | null>(null);
  const [lookingUpAddress, setLookingUpAddress] = useState(false);
  const [lookupMessage, setLookupMessage] = useState('');

  useEffect(() => () => reverseRequest.current?.abort(), []);

  useEffect(() => {
    if (eventId)
      void storageClient
        .images(eventId)
        .then(setEventImages)
        .catch(() => {});
  }, [eventId]);

  async function saveImages(id: string) {
    const changes = [
      { slot: 'avatar' as const, file: avatarFile, remove: removeAvatar },
      { slot: 'cover' as const, file: coverFile, remove: removeCover },
    ];
    for (const change of changes) {
      try {
        if (change.file)
          await storageClient.uploadEventImage(id, change.slot, change.file);
        else if (change.remove)
          await storageClient.removeEventImage(id, change.slot);
      } catch (cause) {
        const reason =
          cause instanceof Error ? cause.message : 'Please try again.';
        show(
          `Event saved, but the ${change.slot} image could not be updated. ${reason}`,
          'warning',
        );
      }
    }
  }

  useEffect(() => {
    if (stepVisited.current)
      stepContent.current?.scrollIntoView({ block: 'start' });
    else stepVisited.current = true;
  }, [step]);

  useEffect(() => {
    async function load() {
      try {
        const sourceId = eventId ?? copyFromId;
        const [loadedCategories, event] = await Promise.all([
          eventsClient.categories(),
          sourceId ? eventsClient.get(sourceId) : Promise.resolve(null),
        ]);
        setCategories(loadedCategories);
        if (event) {
          if (eventId) setExisting(event);
          else setCopySource(event);
          setTitle(event.title);
          setDescription(event.description);
          setCategoryId(event.categoryId ?? '');
          setTimeZone(event.timeZone);
          setStartTime(
            copyFromId ? '' : eventLocalTime(event.startTime, event.timeZone),
          );
          setEndTime(
            copyFromId ? '' : eventLocalTime(event.endTime, event.timeZone),
          );
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
  }, [eventId, copyFromId]);

  useEffect(() => {
    if (eventId || copyFromId || !user) return;
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
  }, [eventId, copyFromId, user?.id]);

  function cancelReverseLookup() {
    reverseRequest.current?.abort();
    reverseRequest.current = null;
    setLookingUpAddress(false);
  }

  async function choosePoint(point: MapPoint, lookup = false) {
    cancelReverseLookup();
    pointChosen.current = true;
    setLatitude(point.latitude.toFixed(6));
    setLongitude(point.longitude.toFixed(6));
    setMapCenter(point);
    setMapZoom(15);
    setLookupMessage('');
    if (!lookup) return;
    setAddress('');
    setRegion('');
    const controller = new AbortController();
    reverseRequest.current = controller;
    setLookingUpAddress(true);
    try {
      const place = await placesClient.reverse(
        point.latitude,
        point.longitude,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      if (place) {
        setRegion((place.region ?? place.city ?? '').slice(0, 100));
        setAddress(place.address);
        setLookupMessage(
          place.address
            ? 'Check the suggested address before saving.'
            : 'No street was found. Enter the address manually.',
        );
      } else setLookupMessage('No address was found. Enter it manually.');
    } catch {
      if (!controller.signal.aborted)
        setLookupMessage('Address lookup failed. Enter the address manually.');
    } finally {
      if (!controller.signal.aborted) {
        reverseRequest.current = null;
        setLookingUpAddress(false);
      }
    }
  }

  function validateStep(index: number): string | null {
    if (index === 0) {
      for (const image of [avatarFile, coverFile]) {
        if (!image) continue;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(image.type))
          return 'Use a PNG, JPEG, or WebP image.';
        if (!image.size || image.size > 5 * 1024 * 1024)
          return 'Images must be between 1 byte and 5 MB.';
      }
      if (!title.trim()) return 'Enter an event title.';
      if (!description.trim()) return 'Enter an event description.';
      if (!startTime || !endTime)
        return 'Choose the start and end date and time.';
      if (
        !participantLimit.trim() ||
        !Number.isInteger(Number(participantLimit)) ||
        Number(participantLimit) < 1
      )
        return 'Enter a whole number of participants greater than zero.';
      try {
        const start = eventUtcTime(startTime, timeZone);
        const end = eventUtcTime(endTime, timeZone);
        if (Date.parse(end) <= Date.parse(start))
          return 'End time must be after start time.';
        const changed =
          !existing || start !== existing.startTime || end !== existing.endTime;
        if (changed && Date.parse(start) <= Date.now())
          return 'The event must start in the future.';
      } catch (cause) {
        return cause instanceof Error
          ? cause.message
          : 'Enter valid event dates.';
      }
    }
    if (index === 1) {
      if (lookingUpAddress) return 'Wait for the address lookup to finish.';
      if (!address.trim()) return 'Enter the venue address.';
      if (!latitude.trim() || !longitude.trim())
        return 'Choose a venue point on the map.';
      const result = EventLocationSchema.safeParse({
        address,
        region,
        latitude: Number(latitude),
        longitude: Number(longitude),
        visibility,
      });
      if (!result.success) return 'Enter a valid address and coordinates.';
    }
    return null;
  }

  function goToStep(next: number) {
    if (next < 0 || next >= EVENT_FORM_STEPS.length || next > reachedStep + 1)
      return;
    if (next > step) {
      for (let index = 0; index < next; index++) {
        const message = validateStep(index);
        if (message) {
          setStep(index);
          setError(message);
          show(message, 'error');
          return;
        }
      }
      setReachedStep((current) => Math.max(current, next));
    }
    setError('');
    setStep(next);
  }

  function handleFormSubmit(event: FormEvent) {
    event.preventDefault();
    if (step < EVENT_FORM_STEPS.length - 1) {
      goToStep(step + 1);
    }
  }

  async function submit() {
    if (step !== EVENT_FORM_STEPS.length - 1 || submitLock.current) return;
    for (let index = 0; index < EVENT_FORM_STEPS.length - 1; index++) {
      const message = validateStep(index);
      if (message) {
        setStep(index);
        setError(message);
        show(message, 'error');
        return;
      }
    }
    submitLock.current = true;
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
        await saveImages(eventId);
        router.push(`/events/${eventId}`);
      } else {
        const created = await eventsClient.create(
          CreateEventSchema.parse(input),
        );
        await saveImages(created.id);
        const allInvitees = [
          ...new Set([
            ...invitees,
            ...(chatEnabled
              ? chatGroups.flatMap((group) =>
                  group.members.map((member) => member.username),
                )
              : []),
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
      const message =
        cause instanceof Error ? cause.message : 'Could not save event.';
      setError(message);
      show(message, 'error');
    } finally {
      submitLock.current = false;
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
    copyFromId &&
    (!copySource ||
      copySource.status !== 'COMPLETED' ||
      !user ||
      (copySource.organizerId !== user.id && user.role !== 'ADMIN'))
  )
    return (
      <div className="space-y-4">
        <Notice
          message={error || 'You cannot create a new event from this one.'}
          tone="error"
        />
        <Button variant="outline" onClick={() => router.push('/my-events')}>
          Back to my events
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
  if (existing?.status === 'COMPLETED')
    return (
      <div className="space-y-4">
        <Notice
          message="This event has ended. Create a new draft from its details to run it again."
          tone="info"
        />
        <Button onClick={() => router.push(`/events/new?from=${existing.id}`)}>
          Create next event
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
    <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <EventStepNavigation
        current={step}
        reached={reachedStep}
        onSelect={(next) => {
          if (!busy) goToStep(next);
        }}
      />
      <div ref={stepContent} className="min-w-0 space-y-5">
        <p className="text-sm text-neutral-500">
          Step {step + 1} of {EVENT_FORM_STEPS.length}
        </p>
        <form id="event-form" noValidate onSubmit={handleFormSubmit}>
          <div hidden={step !== 0}>
            <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8">
              <h2>Event details</h2>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="event-avatar">Event avatar (optional)</label>
                  {eventId &&
                    eventImages.avatar &&
                    !removeAvatar &&
                    !avatarFile && (
                      <EventImage
                        eventId={eventId}
                        slot="avatar"
                        className="mb-3 h-20 w-20 rounded-lg object-cover"
                      />
                    )}
                  <Input
                    id="event-avatar"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      setAvatarFile(event.target.files?.[0] ?? null);
                      setRemoveAvatar(false);
                    }}
                  />
                  {eventImages.avatar && !avatarFile && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={removeAvatar}
                        onChange={(event) =>
                          setRemoveAvatar(event.target.checked)
                        }
                      />{' '}
                      Remove current avatar
                    </label>
                  )}
                </div>
                <div>
                  <label htmlFor="event-cover">
                    Event background (optional)
                  </label>
                  {eventId &&
                    eventImages.cover &&
                    !removeCover &&
                    !coverFile && (
                      <EventImage
                        eventId={eventId}
                        slot="cover"
                        className="mb-3 h-20 w-full rounded-lg object-cover"
                      />
                    )}
                  <Input
                    id="event-cover"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(event) => {
                      setCoverFile(event.target.files?.[0] ?? null);
                      setRemoveCover(false);
                    }}
                  />
                  {eventImages.cover && !coverFile && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={removeCover}
                        onChange={(event) =>
                          setRemoveCover(event.target.checked)
                        }
                      />{' '}
                      Remove current background
                    </label>
                  )}
                </div>
                <p className="text-xs text-neutral-500 sm:col-span-2">
                  PNG, JPEG, or WebP; up to 5 MB each. Images are checked and
                  stored without embedded metadata.
                </p>
              </div>
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
              <div className="flex items-center justify-between gap-3 text-sm">
                <label htmlFor="event-chat-enabled" className="mb-0">
                  Enable event chats for registered participants
                </label>
                <Switch
                  id="event-chat-enabled"
                  checked={chatEnabled}
                  onCheckedChange={setChatEnabled}
                />
              </div>
              {chatEnabled && !eventId && (
                <ChatGroupDraftForm
                  groups={chatGroups}
                  onChange={setChatGroups}
                />
              )}
            </div>
          </div>
          {step === 1 && (
            <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8">
              <h2>Location</h2>
              <p className="text-sm leading-6 text-neutral-600">
                Find a city and address, then choose the precise venue point on
                the map. You can adjust the pin by clicking anywhere on the map.
              </p>
              <PlaceAutocomplete
                id="region"
                label="City or region"
                kind="city"
                value={region}
                onChange={(value) => {
                  cancelReverseLookup();
                  setRegion(value);
                }}
                onSelect={(place) => {
                  cancelReverseLookup();
                  setRegion((place.region ?? place.label).slice(0, 100));
                  setMapCenter({
                    latitude: place.latitude,
                    longitude: place.longitude,
                  });
                  setMapZoom(12);
                }}
                placeholder="Start typing a city"
              />
              <p className="text-xs text-neutral-500">
                City or region is public. Enter only a broad area when the venue
                is private.
              </p>
              <PlaceAutocomplete
                id="address"
                label="Venue address"
                kind="address"
                context={region}
                value={address}
                onChange={(value) => {
                  cancelReverseLookup();
                  setAddress(value);
                }}
                onSelect={(place) => {
                  setAddress(place.address);
                  if (place.region) setRegion(place.region.slice(0, 100));
                  void choosePoint({
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
                onPick={(point) => void choosePoint(point, true)}
                className="h-[390px]"
              />
              <p className="text-sm text-neutral-600">
                {latitude && longitude
                  ? `Selected point: ${latitude}, ${longitude}`
                  : 'Click the map or select an address suggestion to set the venue point.'}
              </p>
              <p className="text-xs text-neutral-500">
                Choosing a point sends its coordinates to Photon to suggest an
                address. Verify the result before saving.
              </p>
              {(lookingUpAddress || lookupMessage) && (
                <p role="status" className="text-sm text-neutral-600">
                  {lookingUpAddress ? 'Looking up the address…' : lookupMessage}
                </p>
              )}
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
                      onChange={(event) => {
                        cancelReverseLookup();
                        setLatitude(event.target.value);
                      }}
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
                      onChange={(event) => {
                        cancelReverseLookup();
                        setLongitude(event.target.value);
                      }}
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
                      void choosePoint({ latitude: lat, longitude: lon }, true);
                      setMapZoom(15);
                      setError('');
                    } else
                      setError(
                        'Enter valid coordinates before placing the pin.',
                      );
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
                  <option value="PUBLIC">
                    Public while a public event is active
                  </option>
                </select>
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  Organizers and administrators can always see the location.
                  Private locations become visible to registered participants
                  after the registration event is processed. Public search uses
                  an approximate map point around the nearby streets for private
                  venues. This may reveal the general area and does not
                  guarantee anonymity.
                </p>
              </div>
              <p className="text-xs leading-5 text-neutral-500">
                Search terms and selected map coordinates are sent to Photon for
                address suggestions. Map tiles are provided by OpenFreeMap.
              </p>
            </div>
          )}
        </form>
        {reachedStep >= 2 && (
          <div hidden={step !== 2}>
            {eventId && (
              <p className="mb-3 text-sm text-neutral-600">
                Use Send invitations to send selected invitations separately
                from saving event changes.
              </p>
            )}
            <InviteParticipants
              eventId={eventId}
              onSelectionChange={setInvitees}
            />
          </div>
        )}
        {step === 3 && (
          <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-6 sm:p-8">
            <div>
              <h2>Review event</h2>
              <p className="mt-2 text-sm text-neutral-600">
                Check the details before saving.
              </p>
            </div>
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Title</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt className="font-semibold">Category</dt>
                <dd>
                  {categories.find((category) => category.id === categoryId)
                    ?.name ?? 'No category'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="font-semibold">Description</dt>
                <dd className="whitespace-pre-wrap">{description}</dd>
              </div>
              <div>
                <dt className="font-semibold">Start</dt>
                <dd>
                  {startTime.replace('T', ' ')} · {timeZone}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">End</dt>
                <dd>
                  {endTime.replace('T', ' ')} · {timeZone}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Venue address</dt>
                <dd>{address}</dd>
              </div>
              <div>
                <dt className="font-semibold">City or region</dt>
                <dd>{region || 'Not specified'}</dd>
              </div>
              <div>
                <dt className="font-semibold">Location visibility</dt>
                <dd>
                  {visibility === 'PUBLIC'
                    ? 'Public while active'
                    : 'Registered participants only'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Event visibility</dt>
                <dd>
                  {eventVisibility === 'PUBLIC'
                    ? 'Public'
                    : eventVisibility === 'UNLISTED'
                      ? 'Direct link only'
                      : 'Invitation required'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Participants</dt>
                <dd>Up to {participantLimit}</dd>
              </div>
              <div>
                <dt className="font-semibold">Chats</dt>
                <dd>
                  {chatEnabled
                    ? eventId
                      ? 'Enabled'
                      : `Enabled · ${chatGroups.length} custom groups`
                    : 'Disabled'}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Selected invitations</dt>
                <dd>{invitees.length}</dd>
              </div>
            </dl>
          </section>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        {existing?.pendingStatus && (
          <p className="text-sm text-amber-700">
            A registration change is processing. Saving is available when it
            finishes.
          </p>
        )}
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={step === 0 || busy}
            onClick={() => goToStep(step - 1)}
          >
            Back
          </Button>
          {step < EVENT_FORM_STEPS.length - 1 ? (
            <Button
              type="button"
              disabled={busy}
              onClick={() => goToStep(step + 1)}
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={busy || Boolean(existing?.pendingStatus)}
            >
              {busy ? 'Saving…' : eventId ? 'Save changes' : 'Create draft'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
