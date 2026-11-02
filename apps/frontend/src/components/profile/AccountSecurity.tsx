'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { authClient } from '@/lib/api/AuthClient';
import { useAuth } from '@/contexts/AuthContext';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AccountSecurity() {
  const { user } = useAuth();
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [emailNotice, setEmailNotice] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    authClient
      .accountCapabilities()
      .then((value) => setEmailAvailable(value.emailDeliveryAvailable))
      .catch(() => setEmailAvailable(false));
  }, []);

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    setEmailError('');
    setEmailNotice('');
    const parsed = z.email().safeParse(newEmail.trim());
    if (!parsed.success) {
      setEmailError('Enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    try {
      await authClient.changeEmail(
        parsed.data,
        `${window.location.origin}/profile`,
      );
      setEmailNotice('Check your email to confirm the change.');
      setNewEmail('');
    } catch (cause) {
      setEmailError(
        cause instanceof Error ? cause.message : 'Could not change email.',
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function submitPassword(event: FormEvent) {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (newPassword.length < 8) {
      setPasswordError('The new password must have at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await authClient.changePassword(currentPassword, newPassword);
      setPasswordNotice('Password changed. Other sessions were signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (cause) {
      setPasswordError(
        cause instanceof Error ? cause.message : 'Could not change password.',
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
            <Notice
              message="Email changes will be available after mail delivery is configured."
              tone="warning"
            />
          )}
          {emailNotice && <Notice message={emailNotice} tone="success" />}
          {emailError && <Notice message={emailError} tone="error" />}
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
          {passwordNotice && <Notice message={passwordNotice} tone="success" />}
          {passwordError && <Notice message={passwordError} tone="error" />}
          <Button disabled={passwordBusy}>
            {passwordBusy ? 'Saving…' : 'Change password'}
          </Button>
        </form>
      </div>
    </section>
  );
}
