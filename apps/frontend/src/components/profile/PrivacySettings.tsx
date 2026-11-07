'use client';

import { useEffect, useState } from 'react';
import type { UserProfilePrivate } from '@event-sharing/contracts';
import { PersonalDataActions } from './PersonalDataActions';
import { usersClient } from '@/lib/api/UsersClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/feedback/Loading';
import { Switch } from '@/components/ui/switch';

type Preferences = UserProfilePrivate['preferences'];

export function PrivacySettings() {
  const { show } = useToast();
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void usersClient.me().then(
      (profile) => setPreferences(profile.preferences),
      (cause) => {
        setError('Privacy settings are unavailable.');
        show(
          cause instanceof Error
            ? cause.message
            : 'Could not load privacy settings.',
          'error',
        );
      },
    );
  }, []);

  async function save() {
    if (!preferences) return;
    setBusy(true);
    try {
      const profile = await usersClient.update({ preferences });
      setPreferences(profile.preferences);
      show('Privacy settings saved.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not save privacy settings.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  function setBoolean(key: keyof Preferences, value: boolean) {
    setPreferences((current) => current && { ...current, [key]: value });
  }

  if (error)
    return (
      <section className="space-y-4">
        <p>{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </section>
    );
  if (!preferences) return <Loading label="Loading privacy settings…" />;

  return (
    <div className="max-w-3xl space-y-8">
      <section className="space-y-6 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Privacy settings</h2>
        <div>
          <label htmlFor="profile-visibility">Who can open my profile</label>
          <select
            id="profile-visibility"
            className="w-full"
            value={preferences.profileVisibility}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                profileVisibility: event.target
                  .value as Preferences['profileVisibility'],
              })
            }
          >
            <option value="PUBLIC">Everyone</option>
            <option value="FRIENDS">Friends</option>
            <option value="PRIVATE">Only me</option>
          </select>
        </div>
        {(
          [
            ['discoverableByUsername', 'Allow people to find me by username'],
            ['allowFriendRequests', 'Allow friend requests'],
            [
              'showParticipationHistory',
              'Show my completed public events in participation history',
            ],
            ['showCity', 'Show my city on my profile'],
            ['showPhone', 'Show my phone on my profile'],
            [
              'allowInvitesFromStrangers',
              'Allow event invitations from non-friends',
            ],
            [
              'notificationsEnabled',
              'Receive event and participation notifications',
            ],
          ] as const
        ).map(([key, label]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 p-3"
          >
            <label htmlFor={`privacy-${key}`} className="mb-0 font-normal">
              {label}
            </label>
            <Switch
              id={`privacy-${key}`}
              checked={preferences[key]}
              onCheckedChange={(value) => setBoolean(key, value)}
            />
          </div>
        ))}
        <p className="text-sm text-neutral-600">
          Your sign-in email and exact location are never part of your public
          profile. Profile visibility does not change these field settings. Only
          completed public events can appear in other users' history view.
        </p>
        <Button onClick={() => void save()} loading={busy}>
          Save privacy settings
        </Button>
      </section>
      <PersonalDataActions />
    </div>
  );
}
