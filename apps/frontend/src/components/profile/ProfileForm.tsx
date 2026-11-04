'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  UpdateUserProfileSchema,
  type UserProfilePrivate,
} from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { Loading } from '@/components/feedback/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';

export function ProfileForm() {
  const { user } = useAuth();
  const { show } = useToast();
  const [profile, setProfile] = useState<UserProfilePrivate | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Could not load profile.';
      setError(message);
      show(message, 'error');
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
    try {
      const input = UpdateUserProfileSchema.parse({
        avatarUrl: avatarUrl.trim() || null,
        bio,
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      setProfile(await usersClient.update(input));
      show('Profile saved.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not save profile.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading label="Loading profile…" />;
  if (!profile)
    return (
      <div className="space-y-4">
        <p>{error || 'Profile is not ready yet.'}</p>
        <Button onClick={() => void load()}>Retry</Button>
      </div>
    );
  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <div className="space-y-6 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Profile details</h2>
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
      <div className="space-y-3">
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </div>
    </form>
  );
}
