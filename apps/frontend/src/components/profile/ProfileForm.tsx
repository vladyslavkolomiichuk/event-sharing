'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  UpdateUserProfileSchema,
  profileAvatarPath,
  type UserProfilePrivate,
} from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { storageClient } from '@/lib/api/StorageClient';
import { Loading } from '@/components/feedback/Loading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PlaceAutocomplete } from '@/components/map/PlaceAutocomplete';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { ProfileAvatar } from './ProfileAvatar';
import { InlineFeedback } from '@/components/feedback/InlineFeedback';

export function ProfileForm() {
  const { user } = useAuth();
  const { show } = useToast();
  const [profile, setProfile] = useState<UserProfilePrivate | null>(null);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const value = await usersClient.me();
      setProfile(value);
      setAvatarUrl(
        value.avatarUrl?.startsWith('/backend/') ? '' : (value.avatarUrl ?? ''),
      );
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
    setSaveError('');
    try {
      const input = UpdateUserProfileSchema.parse({
        avatarUrl:
          avatarUrl.trim() ||
          (profile?.avatarUrl?.startsWith('/backend/')
            ? profile.avatarUrl
            : null),
        bio,
        phone: phone.trim() || null,
        city: city.trim() || null,
      });
      setProfile(await usersClient.update(input));
      show('Profile saved.', 'success');
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Could not save profile.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar() {
    if (!profile || !avatarFile) return;
    setAvatarBusy(true);
    setSaveError('');
    try {
      await storageClient.uploadProfileAvatar(avatarFile);
      setProfile(
        await usersClient.update({
          avatarUrl: profileAvatarPath(profile.userId),
        }),
      );
      setAvatarUrl('');
      setAvatarFile(null);
      show('Avatar saved.', 'success');
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Could not upload avatar.',
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!profile) return;
    setAvatarBusy(true);
    setSaveError('');
    try {
      await storageClient.removeProfileAvatar();
      setProfile(await usersClient.update({ avatarUrl: null }));
      setAvatarUrl('');
      show('Avatar removed.', 'success');
    } catch (cause) {
      setSaveError(
        cause instanceof Error ? cause.message : 'Could not remove avatar.',
      );
    } finally {
      setAvatarBusy(false);
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
          <div className="flex items-center gap-4">
            <ProfileAvatar
              key={profile.version}
              name={user?.name ?? profile.name}
              avatarUrl={profile.avatarUrl}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <label htmlFor="avatar">Optional image URL</label>
              <Input
                id="avatar"
                type="url"
                maxLength={2048}
                value={avatarUrl}
                onChange={(event) => {
                  setAvatarUrl(event.target.value);
                  setSaveError('');
                }}
                placeholder="https://example.com/avatar.jpg"
              />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <label htmlFor="avatar-file">Upload avatar</label>
              <Input
                key={profile.version}
                id="avatar-file"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) =>
                  setAvatarFile(event.target.files?.[0] ?? null)
                }
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!avatarFile || avatarBusy}
              onClick={() => void uploadAvatar()}
            >
              {avatarBusy ? 'Saving…' : 'Upload'}
            </Button>
            {profile.avatarUrl && (
              <Button
                type="button"
                variant="outline"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
              >
                Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Upload a PNG, JPEG, or WebP image up to 5 MB. Access follows your
            profile visibility. External image hosts may receive requests from
            viewers.
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
            maxLength={16}
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSaveError('');
            }}
            validate={(value) =>
              value.trim() && !/^\+[1-9]\d{1,14}$/.test(value.trim())
                ? 'Use E.164 format, for example +33123456789.'
                : ''
            }
            placeholder="+33123456789"
          />
        </div>
      </div>
      <div className="space-y-3">
        {saveError && <InlineFeedback message={saveError} tone="error" />}
        <Button disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
      </div>
    </form>
  );
}
