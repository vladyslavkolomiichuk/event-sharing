'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  UpdateUserProfileSchema,
  type UserProfilePrivate,
} from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { Notice } from '@/components/feedback/Notice';
import { Loading } from '@/components/feedback/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { useAuth } from '@/contexts/AuthContext';

export function ProfileForm() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfilePrivate | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [showPhone, setShowPhone] = useState(false);
  const [showCity, setShowCity] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [allowFriendRequests, setAllowFriendRequests] = useState(true);
  const [allowInvitesFromStrangers, setAllowInvitesFromStrangers] =
    useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const value = await usersClient.me();
      setProfile(value);
      setAvatarUrl(value.avatarUrl ?? '');
      setBio(value.bio ?? '');
      setPhone(value.phone ?? '');
      setCity(value.city ?? '');
      setShowPhone(value.preferences.showPhone);
      setShowCity(value.preferences.showCity);
      setNotificationsEnabled(value.preferences.notificationsEnabled);
      setAllowFriendRequests(value.preferences.allowFriendRequests);
      setAllowInvitesFromStrangers(value.preferences.allowInvitesFromStrangers);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load profile.',
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const input = UpdateUserProfileSchema.parse({
        avatarUrl: avatarUrl.trim() || null,
        bio,
        phone: phone.trim() || null,
        city: city.trim() || null,
        preferences: {
          showPhone,
          showCity,
          notificationsEnabled,
          allowFriendRequests,
          allowInvitesFromStrangers,
        },
      });
      setProfile(await usersClient.update(input));
      setSaved(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not save profile.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading profile…" />;
  if (!profile)
    return (
      <div className="space-y-4">
        <Notice message={error || 'Profile is not ready yet.'} tone="error" />
        <Button onClick={() => void load()}>Retry</Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Public profile</h2>
        <div>
          <label>Name</label>
          <p className="text-sm text-neutral-600">
            {user?.name ?? profile.name}
          </p>
        </div>
        <div>
          <label htmlFor="avatar">Avatar URL</label>
          <Input
            id="avatar"
            type="url"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            placeholder="https://example.com/avatar.jpg"
          />
          <p className="mt-2 text-xs text-neutral-500">
            Image uploads will be available in a later release.
          </p>
        </div>
        <div>
          <label htmlFor="bio">Bio</label>
          <Textarea
            id="bio"
            maxLength={1000}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
          />
        </div>
        <div>
          <PlaceAutocomplete
            id="city"
            label="City"
            kind="city"
            value={city}
            onChange={setCity}
            onSelect={(place) =>
              setCity((place.region ?? place.label).slice(0, 120))
            }
            placeholder="Start typing a city"
          />
          <p className="mt-2 text-xs text-neutral-500">
            City suggestions use Photon. Your search text is sent to the place
            provider.
          </p>
        </div>
        <div>
          <label htmlFor="phone">Phone in E.164 format</label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+33123456789"
          />
        </div>
      </div>
      <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Privacy & preferences</h2>
        <label className="flex items-center gap-3 font-normal">
          <input
            type="checkbox"
            checked={showCity}
            onChange={(event) => setShowCity(event.target.checked)}
          />
          Show my city publicly
        </label>
        <label className="flex items-center gap-3 font-normal">
          <input
            type="checkbox"
            checked={showPhone}
            onChange={(event) => setShowPhone(event.target.checked)}
          />
          Show my phone publicly
        </label>
        <label className="flex items-center gap-3 font-normal">
          <input
            type="checkbox"
            checked={notificationsEnabled}
            onChange={(event) => setNotificationsEnabled(event.target.checked)}
          />
          Receive event and participation updates
        </label>
        <label className="flex items-center gap-3 font-normal">
          <input
            type="checkbox"
            checked={allowFriendRequests}
            onChange={(event) => setAllowFriendRequests(event.target.checked)}
          />
          Allow friend requests
        </label>
        <label className="flex items-center gap-3 font-normal">
          <input
            type="checkbox"
            checked={allowInvitesFromStrangers}
            onChange={(event) =>
              setAllowInvitesFromStrangers(event.target.checked)
            }
          />
          Allow event invitations from people outside my friends
        </label>
        <p className="text-xs leading-5 text-neutral-500">
          Notification delivery is planned. Your preference is already saved
          with your profile.
        </p>
        {saved && <Notice message="Profile saved." tone="success" />}
        {error && <Notice message={error} tone="error" />}
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </div>
    </form>
  );
}
