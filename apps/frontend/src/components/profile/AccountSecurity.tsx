'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountSecurity() {
  const { user } = useAuth();
  const { show } = useToast();
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  useEffect(() => {
    authClient
      .accountCapabilities()
      .then((value) => setEmailAvailable(value.emailDeliveryAvailable))
      .catch(() => setEmailAvailable(false));
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    const parsed = z.email().safeParse(newEmail.trim());
    if (!parsed.success) {
      show('Enter a valid email address.', 'error');
      return;
    }
    setEmailBusy(true);
    try {
      await authClient.changeEmail(
        parsed.data,
        `${window.location.origin}/profile`,
      );
      show('Check your email to confirm the change.', 'success');
      setNewEmail('');
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not change email.',
        'error',
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword.length < 8) {
      show('The new password must have at least 8 characters.', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      show('The new passwords do not match.', 'error');
      return;
    }
    setPasswordBusy(true);
    try {
      await authClient.changePassword(currentPassword, newPassword);
      show('Password changed. Other sessions were signed out.', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not change password.',
        'error',
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2>Account security</h2>
        <p className="mt-2 text-neutral-600">
          Update your sign-in email and password.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form
          onSubmit={submitEmail}
          className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
        >
          <h3>Change email</h3>
          <p className="text-sm text-neutral-600">
            Current email: {user?.email}
          </p>
          <div>
            <label htmlFor="new-email">New email</label>
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              required
              disabled={!emailAvailable || emailBusy}
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </div>
          {!emailAvailable && (
            <p className="text-sm text-amber-800">
              Email changes will be available after mail delivery is configured.
            </p>
          )}
          <Button disabled={!emailAvailable || emailBusy}>
            {emailBusy ? 'Sending…' : 'Send confirmation email'}
          </Button>
        </form>
        <form
          onSubmit={submitPassword}
          className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
        >
          <h3>Change password</h3>
          <div>
            <label htmlFor="current-password">Current password</label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="new-password">New password</label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="confirm-password">Confirm new password</label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
            />
          </div>
          <Button disabled={passwordBusy}>
            {passwordBusy ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </div>
    </section>
  );
}
