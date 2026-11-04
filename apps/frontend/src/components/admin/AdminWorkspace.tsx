'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type {
  SystemServicesResponse,
  UserProfilePublic,
  UserRole,
} from '@event-sharing/contracts';
import { gateway } from '@/lib/api/GatewayClient';
import { authClient } from '@/lib/api/AuthClient';
import { eventsClient, type Category } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { Notice } from '@/components/feedback/Notice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserProfileLink } from '@/components/profile/UserProfileLink';
import { OrganizerRequestsPanel } from './OrganizerRequestsPanel';

export function AdminWorkspace() {
  const router = useRouter();
  const [services, setServices] = useState<SystemServicesResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [userName, setUserName] = useState('');
  const [userMatches, setUserMatches] = useState<UserProfilePublic[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfilePublic | null>(
    null,
  );
  const [moderationEventId, setModerationEventId] = useState('');
  const [role, setRole] = useState<UserRole>('ORGANIZER');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const [status, listed] = await Promise.all([
        gateway.get<SystemServicesResponse>('/api/system/services'),
        eventsClient.categories(),
      ]);
      setServices(status);
      setCategories(listed);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not load admin data.',
      );
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await eventsClient.createCategory(name.trim());
      setName('');
      setNotice('Category created.');
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not create category.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await authClient.changeRole(selectedUser.username, role);
      setNotice('Role updated. The user may need to refresh their session.');
      setSelectedUser(null);
      setUserName('');
      setUserMatches([]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not change role.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function findUsers(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setUserMatches([]);
    setSelectedUser(null);
    try {
      setUserMatches(
        (await usersClient.searchByUsername(userName.trim())).items,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not find users.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-7 lg:grid-cols-2">
      <OrganizerRequestsPanel />
      <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
        <div className="flex items-center justify-between">
          <h2>Services</h2>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh
          </Button>
        </div>
        <div className="divide-y divide-neutral-200">
          {services?.services.map((service) => (
            <div
              key={service.service}
              className="flex justify-between py-3 text-sm"
            >
              <span>{service.service}</span>
              <Badge
                className={
                  service.status === 'ok'
                    ? 'border-green-300 bg-green-50 text-green-900'
                    : 'border-red-300 bg-red-50 text-red-900'
                }
              >
                {service.status}
              </Badge>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Categories</h2>
        <form onSubmit={createCategory} className="flex gap-2">
          <Input
            aria-label="Category name"
            maxLength={100}
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="New category"
          />
          <Button disabled={busy}>Add</Button>
        </form>
        <ul className="divide-y divide-neutral-200 text-sm">
          {categories.map((category) => (
            <li key={category.id} className="py-2">
              {category.name}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>User roles</h2>
        <p className="text-sm text-neutral-600">
          Find a user by username, then assign a role.
        </p>
        <form onSubmit={findUsers} className="flex gap-2">
          <div>
            <label htmlFor="user-name">Username</label>
            <Input
              id="user-name"
              required
              minLength={2}
              maxLength={30}
              value={userName}
              onChange={(event) => setUserName(event.target.value)}
              placeholder="Search by username"
            />
          </div>
          <Button className="self-end" disabled={busy}>
            Find
          </Button>
        </form>
        {userMatches.length > 0 && (
          <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200">
            {userMatches.map((person) => (
              <li key={person.userId}>
                <button
                  type="button"
                  className="w-full px-4 py-3 text-left hover:bg-neutral-50"
                  onClick={() => setSelectedUser(person)}
                >
                  <span className="font-semibold">{person.name}</span>
                  <span className="ml-2 text-sm text-neutral-500">
                    @{person.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selectedUser && (
          <form onSubmit={changeRole} className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">Selected user</p>
              <UserProfileLink
                userId={selectedUser.userId}
                profile={selectedUser}
              />
            </div>
            <div>
              <label htmlFor="role">Role</label>
              <select
                id="role"
                className="w-full"
                value={role}
                onChange={(event) => setRole(event.target.value as UserRole)}
              >
                <option value="USER">User</option>
                <option value="ORGANIZER">Organizer</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
            <Button disabled={busy}>Update role</Button>
          </form>
        )}
      </section>
      <section className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7">
        <h2>Moderation</h2>
        <p className="text-sm leading-6 text-neutral-600">
          Open an event in moderation to approve or reject it. The event detail
          page shows actions available to administrators.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            router.push(`/events/${moderationEventId.trim()}`);
          }}
          className="flex gap-2"
        >
          <Input
            aria-label="Event ID"
            required
            value={moderationEventId}
            onChange={(event) => setModerationEventId(event.target.value)}
            placeholder="Event ID"
          />
          <Button>Open</Button>
        </form>
      </section>
      {notice && <Notice message={notice} tone="success" />}
      {error && <Notice message={error} tone="error" />}
    </div>
  );
}
