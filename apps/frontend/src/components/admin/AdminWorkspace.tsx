'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import type {
  SystemServicesResponse,
  UserProfilePublic,
  UserRole,
} from '@event-sharing/contracts';
import { gateway } from '@/lib/api/GatewayClient';
import { authClient } from '@/lib/api/AuthClient';
import { eventsClient, type Category } from '@/lib/api/EventsClient';
import { usersClient } from '@/lib/api/UsersClient';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { UserProfileLink } from '@/components/profile/UserProfileLink';
import { OrganizerRequestsPanel } from './OrganizerRequestsPanel';
import { ModerationQueue } from './ModerationQueue';
import { PrivacyRequests } from './PrivacyRequests';
import { SystemMessagesPanel } from './SystemMessagesPanel';

export type AdminSection =
  | 'overview'
  | 'moderation'
  | 'role-requests'
  | 'user-roles'
  | 'categories'
  | 'privacy-requests'
  | 'system-messages'
  | 'danger-zone';

export function AdminWorkspace({
  section = 'overview',
}: {
  section?: AdminSection;
}) {
  const router = useRouter();
  const { show } = useToast();
  const [services, setServices] = useState<SystemServicesResponse | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [name, setName] = useState('');
  const [userName, setUserName] = useState('');
  const [userMatches, setUserMatches] = useState<UserProfilePublic[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfilePublic | null>(
    null,
  );
  const [role, setRole] = useState<UserRole>('ORGANIZER');
  const [busy, setBusy] = useState(false);
  const [moderationCount, setModerationCount] = useState<number | null>(null);
  const [roleRequestCount, setRoleRequestCount] = useState<number | null>(null);

  async function refresh() {
    try {
      const [status, listed] = await Promise.all([
        gateway.get<SystemServicesResponse>('/api/system/services'),
        eventsClient.categories(),
      ]);
      setServices(status);
      setCategories(listed);
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not load admin data.',
        'error',
      );
    }
  }

  useEffect(() => {
    if (section === 'overview' || section === 'categories') void refresh();
  }, [section]);

  useEffect(() => {
    if (
      section === 'overview' &&
      window.location.hash.startsWith('#organizer-request-')
    )
      router.replace(`/admin/role-requests${window.location.hash}`);
    const loadCounts = () => {
      void eventsClient
        .moderation()
        .then((page) => setModerationCount(page.total))
        .catch(() => {});
      void authClient
        .pendingOrganizerRequests()
        .then((page) => setRoleRequestCount(page.total))
        .catch(() => {});
    };
    loadCounts();
    window.addEventListener('notifications:remote', loadCounts);
    return () => window.removeEventListener('notifications:remote', loadCounts);
  }, [section, router]);

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await eventsClient.createCategory(name.trim());
      setName('');
      show('Category created.', 'success');
      await refresh();
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not create category.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(event: FormEvent) {
    event.preventDefault();
    if (!selectedUser) return;
    setBusy(true);
    try {
      await authClient.changeRole(selectedUser.username, role);
      show('Role updated.', 'success');
      setSelectedUser(null);
      setUserName('');
      setUserMatches([]);
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not change role.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  async function findUsers(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setUserMatches([]);
    setSelectedUser(null);
    try {
      setUserMatches(
        (await usersClient.searchByUsername(userName.trim())).items,
      );
    } catch (cause) {
      show(
        cause instanceof Error ? cause.message : 'Could not find users.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <nav
        aria-label="Admin sections"
        className="flex gap-2 overflow-x-auto text-sm lg:sticky lg:top-5 lg:flex-col lg:self-start"
      >
        {(
          [
            ['overview', 'Overview'],
            ['moderation', 'Event moderation'],
            ['role-requests', 'Role requests'],
            ['user-roles', 'User roles'],
            ['categories', 'Categories'],
            ['privacy-requests', 'Privacy requests'],
            ['system-messages', 'System messages'],
            ['danger-zone', 'Danger Zone'],
          ] as const
        ).map(([key, label]) => {
          const count =
            key === 'moderation'
              ? moderationCount
              : key === 'role-requests'
                ? roleRequestCount
                : null;
          return (
            <Link
              key={key}
              href={key === 'overview' ? '/admin' : `/admin/${key}`}
              aria-current={section === key ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 ${key === 'danger-zone' ? 'text-red-700 hover:bg-red-50' : 'hover:bg-neutral-100'} ${section === key ? 'bg-neutral-100 font-semibold' : ''}`}
            >
              {label}
              {count !== null && <Badge>{count}</Badge>}
            </Link>
          );
        })}
      </nav>
      <div className="grid min-w-0 gap-7 lg:grid-cols-2">
        {section === 'role-requests' && (
          <OrganizerRequestsPanel onCountChange={setRoleRequestCount} />
        )}
        {section === 'moderation' && (
          <ModerationQueue onCountChange={setModerationCount} />
        )}
        {section === 'system-messages' && <SystemMessagesPanel />}
        {section === 'danger-zone' && (
          <section className="space-y-5 rounded-xl border border-red-200 bg-white p-7 lg:col-span-2">
            <h2>Danger Zone</h2>
            <p className="text-neutral-600">
              Service container controls may be added here later.
            </p>
          </section>
        )}
        {section === 'overview' && (
          <section
            id="admin-overview"
            className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
          >
            <div className="flex items-center justify-between">
              <h2>Services</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refresh()}
              >
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
        )}
        {section === 'categories' && (
          <section
            id="admin-categories"
            className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
          >
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
        )}
        {section === 'user-roles' && (
          <section
            id="admin-user-roles"
            className="space-y-5 rounded-xl border border-neutral-200 bg-white p-7"
          >
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
                    onChange={(event) =>
                      setRole(event.target.value as UserRole)
                    }
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
        )}
        {section === 'privacy-requests' && (
          <div className="lg:col-span-2">
            <PrivacyRequests />
          </div>
        )}
      </div>
    </div>
  );
}
