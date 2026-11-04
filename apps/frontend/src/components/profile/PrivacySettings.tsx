'use client';

import { useEffect, useState } from 'react';
import type { UserProfilePrivate } from '@event-sharing/contracts';
import { usersClient } from '@/lib/api/UsersClient';
import { authClient } from '@/lib/api/AuthClient';
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
  const [deletionRequestedAt, setDeletionRequestedAt] = useState<string | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [requestingDeletion, setRequestingDeletion] = useState(false);

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

  useEffect(() => {
    void authClient.deletionRequest().then(
      (request) => setDeletionRequestedAt(request.requestedAt ?? null),
      () => show('Could not load deletion request status.', 'error'),
    );
  }, []);

  async function downloadData() {
    setExporting(true);
    setExportError('');
    try {
      const response = await fetch('/backend/api/privacy/export', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 503
            ? 'Your export is unavailable while a service is offline. Please try again later.'
            : 'Could not prepare your data export. Please try again.',
        );
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = 'event-sharing-data.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      show('Your data export is ready.', 'success');
    } catch (cause) {
      setExportError(
        cause instanceof Error ? cause.message : 'Data export failed.',
      );
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setRequestingDeletion(true);
    try {
      const request = await authClient.requestDeletion();
      setDeletionRequestedAt(request.requestedAt);
      show('Your deletion request was recorded.', 'success');
    } catch (cause) {
      show(
        cause instanceof Error
          ? cause.message
          : 'Could not record your request.',
        'error',
      );
    } finally {
      setRequestingDeletion(false);
    }
  }

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
        <Button disabled={busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save privacy settings'}
        </Button>
      </section>
      <section className="space-y-4 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Your data</h2>
        <p className="text-sm text-neutral-600">
          Download a JSON copy of your account, profile, events, participation,
          messages, notifications, search preference, and activity records.
        </p>
        <Button
          variant="outline"
          disabled={exporting}
          onClick={() => void downloadData()}
        >
          {exporting ? 'Preparing export…' : 'Download my data'}
        </Button>
        {exportError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          >
            {exportError}
          </p>
        )}
        <div className="space-y-3 border-t border-neutral-200 pt-5">
          <h3>Account deletion</h3>
          <p className="text-sm text-neutral-600">
            Submit a request for manual review. Your account and data remain
            active while it is pending. The request itself does not erase your
            data. Use the contact address below to follow up.
          </p>
          {deletionRequestedAt ? (
            <p className="text-sm">
              Request pending since{' '}
              {new Date(deletionRequestedAt).toLocaleDateString('en-US')}.
            </p>
          ) : (
            <Button
              variant="outline"
              disabled={requestingDeletion}
              onClick={() => void requestDeletion()}
            >
              {requestingDeletion ? 'Submitting…' : 'Request account deletion'}
            </Button>
          )}
          <p className="text-sm text-neutral-600">
            Questions about your data can be sent to{' '}
            <a className="underline" href="mailto:vladkolomu@gmail.com">
              vladkolomu@gmail.com
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
