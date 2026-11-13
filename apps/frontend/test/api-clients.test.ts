import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authClient } from '@/lib/api/AuthClient';
import { eventLogClient } from '@/lib/api/EventLogClient';
import { eventRouteClient } from '@/lib/api/EventRouteClient';
import { eventsClient } from '@/lib/api/EventsClient';
import { friendsClient } from '@/lib/api/FriendsClient';
import { ApiError, gateway } from '@/lib/api/GatewayClient';
import { invitationClient } from '@/lib/api/InvitationClient';
import { messagesClient } from '@/lib/api/MessagesClient';
import { notificationsClient } from '@/lib/api/NotificationsClient';
import { participationClient } from '@/lib/api/ParticipationClient';
import { placesClient } from '@/lib/api/PlacesClient';
import { searchClient } from '@/lib/api/SearchClient';
import { storageClient } from '@/lib/api/StorageClient';
import { usersClient } from '@/lib/api/UsersClient';

const E = '7d1f5b8e-2c4a-4f6e-9b3d-1a2b3c4d5e6f';
const R = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';

let fetch: ReturnType<typeof vi.fn>;
const dispatchEvent = vi.fn();
beforeEach(() => {
  fetch = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('window', { dispatchEvent });
  dispatchEvent.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

const lastCall = () => {
  const [url, init = {}] = fetch.mock.calls.at(-1)! as [string, RequestInit];
  return {
    url,
    method: init.method ?? 'GET',
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    init,
  };
};

describe('GatewayClient', () => {
  it('sends JSON with credentials through the backend prefix', async () => {
    expect(await gateway.post('/api/x', { a: 1 })).toEqual({ ok: true });
    const { url, init } = lastCall();
    expect(url).toBe('/backend/api/x');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'content-type': 'application/json' },
    });
    await gateway.get('/api/y');
    expect(lastCall().init.headers).toEqual({});
  });

  it('maps API errors and announces expired sessions', async () => {
    fetch.mockResolvedValueOnce(
      Response.json(
        { code: 'UNAUTHORIZED', message: 'Sign in.' },
        { status: 401 },
      ),
    );
    await expect(gateway.get('/api/me')).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Sign in.',
    });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'auth:expired' }),
    );
    fetch.mockResolvedValueOnce(new Response('oops', { status: 503 }));
    await expect(gateway.get('/auth/x')).rejects.toMatchObject({
      code: 'REQUEST_FAILED',
      message: 'The service is unavailable right now. Try again soon.',
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    fetch.mockResolvedValueOnce(new Response('', { status: 400 }));
    await expect(gateway.get('/api/x')).rejects.toThrow(
      'The request could not be completed.',
    );
  });

  it('maps network failures but keeps aborts', async () => {
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(gateway.get('/api/x')).rejects.toMatchObject({
      status: 0,
      code: 'NETWORK_ERROR',
    });
    const abort = new DOMException('Aborted', 'AbortError');
    fetch.mockRejectedValueOnce(abort);
    await expect(gateway.get('/api/x')).rejects.toBe(abort);
  });

  it('exposes PUT, PATCH and DELETE helpers', async () => {
    await gateway.put('/a', { b: 1 });
    expect(lastCall().method).toBe('PUT');
    await gateway.patch('/a', { b: 1 });
    expect(lastCall().method).toBe('PATCH');
    await gateway.delete('/a');
    expect(lastCall()).toMatchObject({ method: 'DELETE', body: undefined });
    expect(new ApiError(418, 'TEA', 'Teapot')).toBeInstanceOf(Error);
  });
});

// Each row: call, expected method, path after /backend, expected body.
const cases: [string, () => Promise<unknown>, string, string, unknown?][] = [
  [
    'auth session',
    () => authClient.getSession(),
    'GET',
    '/auth/get-session?disableCookieCache=true',
  ],
  [
    'auth sign in',
    () => authClient.signIn('a@b.test', 'pw'),
    'POST',
    '/auth/sign-in/email',
    { email: 'a@b.test', password: 'pw' },
  ],
  [
    'auth sign up',
    () => authClient.signUp('Iryna', 'iryna', 'a@b.test', 'pw'),
    'POST',
    '/auth/sign-up/email',
    { name: 'Iryna', username: 'iryna', email: 'a@b.test', password: 'pw' },
  ],
  ['auth sign out', () => authClient.signOut(), 'POST', '/auth/sign-out', {}],
  [
    'auth capabilities',
    () => authClient.accountCapabilities(),
    'GET',
    '/auth/account-capabilities',
  ],
  [
    'auth social accounts',
    () => authClient.socialAccounts(),
    'GET',
    '/auth/social-accounts',
  ],
  [
    'auth deletion status',
    () => authClient.deletionRequest(),
    'GET',
    '/auth/privacy/deletion-request',
  ],
  [
    'auth request deletion',
    () => authClient.requestDeletion(),
    'POST',
    '/auth/privacy/deletion-request',
    {},
  ],
  [
    'auth deletion queue',
    () => authClient.pendingDeletionRequests(),
    'GET',
    '/auth/admin/privacy-requests',
  ],
  [
    'auth username check',
    () => authClient.usernameAvailable('a b'),
    'GET',
    '/auth/username-availability?username=a%20b',
  ],
  [
    'auth suggestions',
    () => authClient.usernameSuggestions('Ірина'),
    'GET',
    `/auth/username-suggestions?name=${encodeURIComponent('Ірина')}`,
  ],
  [
    'auth password',
    () => authClient.changePassword('old', 'new'),
    'POST',
    '/auth/change-password',
    { currentPassword: 'old', newPassword: 'new', revokeOtherSessions: true },
  ],
  [
    'auth email',
    () => authClient.changeEmail('n@b.test', '/settings'),
    'POST',
    '/auth/change-email',
    { newEmail: 'n@b.test', callbackURL: '/settings' },
  ],
  [
    'auth identity',
    () => authClient.updateIdentity({ name: 'I' }),
    'PATCH',
    '/auth/identity',
    { name: 'I' },
  ],
  [
    'auth reset request',
    () => authClient.requestPasswordReset('a@b.test', '/reset'),
    'POST',
    '/auth/request-password-reset',
    { email: 'a@b.test', redirectTo: '/reset' },
  ],
  [
    'auth reset',
    () => authClient.resetPassword('t', 'pw'),
    'POST',
    '/auth/reset-password',
    { token: 't', newPassword: 'pw' },
  ],
  [
    'auth role',
    () => authClient.changeRole('iryna', 'ADMIN'),
    'PATCH',
    '/auth/admin/users/iryna/role',
    { role: 'ADMIN' },
  ],
  [
    'auth organizer request',
    () => authClient.organizerRequest(),
    'GET',
    '/auth/organizer-requests/me',
  ],
  [
    'auth submit request',
    () => authClient.submitOrganizerRequest('why'),
    'POST',
    '/auth/organizer-requests',
    { reason: 'why' },
  ],
  [
    'auth pending requests',
    () => authClient.pendingOrganizerRequests(),
    'GET',
    '/auth/admin/organizer-requests',
  ],
  [
    'auth decide',
    () => authClient.decideOrganizerRequest(E, 'reject', 'No.'),
    'POST',
    `/auth/admin/organizer-requests/${E}/reject`,
    { decisionReason: 'No.' },
  ],
  [
    'event log analytics',
    () => eventLogClient.analytics(7),
    'GET',
    '/api/event-log/analytics?days=7',
  ],
  [
    'event log entries',
    () =>
      eventLogClient.entries({ producer: 'auth', eventType: '', limit: 10 }),
    'GET',
    '/api/event-log/entries?producer=auth&limit=10',
  ],
  [
    'events categories',
    () => eventsClient.categories(),
    'GET',
    '/api/events/categories',
  ],
  [
    'events new category',
    () => eventsClient.createCategory('Art'),
    'POST',
    '/api/events/categories',
    { name: 'Art' },
  ],
  [
    'events list',
    () => eventsClient.list('c1', 'uncategorized'),
    'GET',
    '/api/events?cursor=c1&categoryId=uncategorized',
  ],
  ['events list plain', () => eventsClient.list(), 'GET', '/api/events'],
  [
    'events mine',
    () => eventsClient.mine('a+b'),
    'GET',
    '/api/events/mine?cursor=a%2Bb',
  ],
  [
    'events moderation',
    () => eventsClient.moderation(),
    'GET',
    '/api/events/moderation',
  ],
  [
    'events organizer',
    () => eventsClient.byOrganizer(E),
    'GET',
    `/api/events/organizer/${E}`,
  ],
  ['events get', () => eventsClient.get(E), 'GET', `/api/events/${E}`],
  [
    'events create',
    () => eventsClient.create({ title: 'A' } as never),
    'POST',
    '/api/events',
    { title: 'A' },
  ],
  [
    'events update',
    () => eventsClient.update(E, { title: 'B' }),
    'PATCH',
    `/api/events/${E}`,
    { title: 'B' },
  ],
  [
    'events chat',
    () => eventsClient.updateChatSetting(E, true),
    'PATCH',
    `/api/events/${E}/chat`,
    { chatEnabled: true },
  ],
  [
    'events action',
    () => eventsClient.action(E, 'registration/open'),
    'POST',
    `/api/events/${E}/registration/open`,
    {},
  ],
  [
    'friends search',
    () => friendsClient.search('ol', 'username', 2),
    'GET',
    '/api/users/friends/search?q=ol&sort=username&page=2',
  ],
  [
    'friends list',
    () => friendsClient.list(1),
    'GET',
    '/api/users/friends?page=1',
  ],
  [
    'friends request',
    () => friendsClient.request('olena'),
    'POST',
    '/api/users/friends/requests',
    { username: 'olena' },
  ],
  [
    'friends decide',
    () => friendsClient.decide(R, 'ACCEPTED'),
    'PATCH',
    `/api/users/friends/requests/${R}`,
    { action: 'ACCEPTED' },
  ],
  [
    'friends remove',
    () => friendsClient.remove('olena'),
    'DELETE',
    '/api/users/friends/olena',
  ],
  [
    'friends block',
    () => friendsClient.block('olena'),
    'PUT',
    '/api/users/blocks/olena',
    {},
  ],
  [
    'friends unblock',
    () => friendsClient.unblock('olena'),
    'DELETE',
    '/api/users/blocks/olena',
  ],
  [
    'invite link',
    () => invitationClient.createLink(E, '2026-12-01T00:00:00.000Z', 5),
    'POST',
    `/api/participation/events/${E}/invite-links`,
    { expiresAt: '2026-12-01T00:00:00.000Z', maxUses: 5 },
  ],
  [
    'invite links',
    () => invitationClient.links(E),
    'GET',
    `/api/participation/events/${E}/invite-links`,
  ],
  [
    'invite revoke link',
    () => invitationClient.revokeLink(E, R),
    'DELETE',
    `/api/participation/events/${E}/invite-links/${R}`,
  ],
  [
    'invite preview',
    () => invitationClient.previewLink('t/x'),
    'GET',
    '/api/participation/invitations/link/t%2Fx',
  ],
  [
    'invite accept link',
    () => invitationClient.acceptLink('tok'),
    'POST',
    '/api/participation/invitations/link/tok/accept',
    {},
  ],
  [
    'invite send',
    () => invitationClient.send(E, ['olena']),
    'POST',
    `/api/participation/events/${E}/invitations`,
    { usernames: ['olena'] },
  ],
  [
    'invite incoming',
    () => invitationClient.incoming(),
    'GET',
    '/api/participation/invitations',
  ],
  [
    'invite outgoing',
    () => invitationClient.outgoing(E),
    'GET',
    `/api/participation/events/${E}/invitations`,
  ],
  [
    'invite accept',
    () => invitationClient.accept(R),
    'POST',
    `/api/participation/invitations/${R}/accept`,
    {},
  ],
  [
    'invite decline',
    () => invitationClient.decline(R),
    'POST',
    `/api/participation/invitations/${R}/decline`,
    {},
  ],
  [
    'invite revoke',
    () => invitationClient.revoke(R),
    'DELETE',
    `/api/participation/invitations/${R}`,
  ],
  [
    'chat overview',
    () => messagesClient.overview(),
    'GET',
    '/api/messages/overview',
  ],
  [
    'chat rooms',
    () => messagesClient.rooms(E),
    'GET',
    `/api/messages/events/${E}/rooms`,
  ],
  [
    'chat create',
    () =>
      messagesClient.createRoom(E, {
        name: 'A',
        access: 'ALL_PARTICIPANTS',
        memberIds: [],
      }),
    'POST',
    `/api/messages/events/${E}/rooms`,
    { name: 'A', access: 'ALL_PARTICIPANTS', memberIds: [] },
  ],
  [
    'chat update',
    () => messagesClient.updateRoom(E, R, { name: 'B' }),
    'PATCH',
    `/api/messages/events/${E}/rooms/${R}`,
    { name: 'B' },
  ],
  [
    'chat members',
    () => messagesClient.members(E, R),
    'GET',
    `/api/messages/events/${E}/rooms/${R}/members`,
  ],
  [
    'chat add',
    () => messagesClient.addMembers(E, R, [E]),
    'POST',
    `/api/messages/events/${E}/rooms/${R}/members`,
    { userIds: [E] },
  ],
  [
    'chat remove',
    () => messagesClient.removeMember(E, R, E),
    'DELETE',
    `/api/messages/events/${E}/rooms/${R}/members/${E}`,
  ],
  [
    'chat archive',
    () => messagesClient.archiveRoom(E, R),
    'PATCH',
    `/api/messages/events/${E}/rooms/${R}/archive`,
    {},
  ],
  [
    'chat mute',
    () => messagesClient.updateRoomNotifications(E, R, false),
    'PATCH',
    `/api/messages/events/${E}/rooms/${R}/notifications`,
    { enabled: false },
  ],
  [
    'chat messages',
    () => messagesClient.messages(E, R, 'm1'),
    'GET',
    `/api/messages/events/${E}/rooms/${R}/messages?before=m1`,
  ],
  [
    'chat send',
    () => messagesClient.send(E, R, 'Hi', R),
    'POST',
    `/api/messages/events/${E}/rooms/${R}/messages`,
    { body: 'Hi', clientMessageId: R },
  ],
  [
    'chat read',
    () => messagesClient.markRead(E, R, R),
    'PATCH',
    `/api/messages/events/${E}/rooms/${R}/read`,
    { messageId: R },
  ],
  [
    'system list',
    () => notificationsClient.systemMessages('c'),
    'GET',
    '/api/notifications/system?cursor=c',
  ],
  [
    'system create',
    () =>
      notificationsClient.createSystemMessage({
        title: 'T',
        body: 'B',
        audience: 'ALL',
      }),
    'POST',
    '/api/notifications/system',
    { title: 'T', body: 'B', audience: 'ALL' },
  ],
  [
    'system remove',
    () => notificationsClient.removeSystemMessage(E),
    'DELETE',
    `/api/notifications/system/${E}`,
  ],
  [
    'notifications list',
    () => notificationsClient.list('c', 'UNREAD'),
    'GET',
    '/api/notifications?cursor=c&filter=UNREAD',
  ],
  [
    'notifications all',
    () => notificationsClient.list(),
    'GET',
    '/api/notifications',
  ],
  [
    'notifications count',
    () => notificationsClient.unreadCount(),
    'GET',
    '/api/notifications/unread-count',
  ],
  [
    'notifications read',
    () => notificationsClient.markRead(E),
    'PATCH',
    `/api/notifications/${E}/read`,
    {},
  ],
  [
    'notifications read all',
    () => notificationsClient.markAllRead(),
    'PATCH',
    '/api/notifications/read-all',
    {},
  ],
  [
    'notifications remove',
    () => notificationsClient.remove(E),
    'DELETE',
    `/api/notifications/${E}`,
  ],
  [
    'notifications announce',
    () => notificationsClient.sendEvent(E, 'Hi'),
    'POST',
    `/api/notifications/events/${E}/messages`,
    { body: 'Hi' },
  ],
  [
    'notifications message',
    () => notificationsClient.getMessage(E),
    'GET',
    `/api/notifications/messages/${E}`,
  ],
  [
    'participation hide',
    () => participationClient.hideHistory(E),
    'DELETE',
    `/api/participation/me/history/${E}`,
  ],
  [
    'participation availability',
    () => participationClient.availability(E),
    'GET',
    `/api/participation/events/${E}/availability`,
  ],
  [
    'participation join',
    () => participationClient.join(E),
    'POST',
    `/api/participation/events/${E}/join`,
    {},
  ],
  [
    'participation leave',
    () => participationClient.leave(E),
    'DELETE',
    `/api/participation/events/${E}/join`,
  ],
  [
    'participation mine',
    () => participationClient.mine('c'),
    'GET',
    '/api/participation/me?cursor=c',
  ],
  [
    'participation history',
    () => participationClient.history(E, 2),
    'GET',
    `/api/participation/users/${E}/history?page=2`,
  ],
  [
    'participation participants',
    () => participationClient.participants(E),
    'GET',
    `/api/participation/events/${E}/participants`,
  ],
  [
    'search preference',
    () => searchClient.preference(),
    'GET',
    '/api/search/preference',
  ],
  [
    'search save preference',
    () => searchClient.savePreference('CITY'),
    'PUT',
    '/api/search/preference',
    { mode: 'CITY' },
  ],
  [
    'search events',
    () => searchClient.events({ sort: 'start_time', limit: 20 }),
    'POST',
    '/api/search/events',
    { sort: 'start_time', limit: 20 },
  ],
  [
    'search map',
    () => searchClient.mapPoints({ sort: 'start_time', limit: 20 }),
    'POST',
    '/api/search/events/map',
    { sort: 'start_time', limit: 20 },
  ],
  [
    'route',
    () =>
      eventRouteClient.route({
        eventId: E,
        origin: { latitude: 1, longitude: 2 },
        mode: 'walk',
      }),
    'POST',
    '/api/search/route',
    { eventId: E, origin: { latitude: 1, longitude: 2 }, mode: 'walk' },
  ],
  ['users me', () => usersClient.me(), 'GET', '/api/users/me'],
  ['users get', () => usersClient.get(E), 'GET', `/api/users/${E}`],
  [
    'users by name',
    () => usersClient.getByUsername('o l'),
    'GET',
    '/api/users/by-username/o%20l',
  ],
  [
    'users many',
    () => usersClient.getMany([E, E, R]),
    'GET',
    `/api/users?ids=${encodeURIComponent(`${E},${R}`)}`,
  ],
  [
    'users search',
    () => usersClient.searchByUsername('@ol', 'c'),
    'GET',
    '/api/users/search?username=ol&cursor=c',
  ],
  [
    'users update',
    () => usersClient.update({ city: 'Kyiv' }),
    'PATCH',
    '/api/users/me',
    { city: 'Kyiv' },
  ],
];

describe('API clients', () => {
  it.each(cases)('%s', async (_name, call, method, path, body) => {
    await call();
    const actual = lastCall();
    expect(actual.method).toBe(method);
    expect(actual.url).toBe(`/backend${path}`);
    expect(actual.body).toEqual(body);
  });

  it('skips the request for an empty profile list', async () => {
    expect(await usersClient.getMany([])).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns the social redirect or fails without one', async () => {
    fetch.mockResolvedValueOnce(
      Response.json({ url: 'https://github.com/login' }),
    );
    expect(await authClient.startSocial('github', '/a', '/b', true)).toBe(
      'https://github.com/login',
    );
    expect(lastCall()).toMatchObject({
      url: '/backend/auth/link-social',
      body: { provider: 'github', disableRedirect: true },
    });
    fetch.mockResolvedValueOnce(Response.json({}));
    await expect(authClient.startSocial('google', '/a', '/b')).rejects.toThrow(
      'Could not start social sign-in.',
    );
  });

  it('reports membership and treats 404 as not joined', async () => {
    fetch.mockResolvedValueOnce(Response.json({ status: 'JOINED' }));
    expect(await participationClient.joined(E, R)).toBe(true);
    fetch.mockResolvedValueOnce(
      Response.json({ code: 'NOT_FOUND' }, { status: 404 }),
    );
    expect(await participationClient.joined(E, R)).toBe(false);
    fetch.mockResolvedValueOnce(Response.json({}, { status: 500 }));
    await expect(participationClient.joined(E, R)).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

describe('PlacesClient', () => {
  it('reverse geocodes and searches places', async () => {
    fetch.mockResolvedValueOnce(Response.json({ place: null }));
    expect(await placesClient.reverse(50, 30)).toBeNull();
    expect(lastCall()).toMatchObject({
      url: '/places/reverse',
      method: 'POST',
      body: { latitude: 50, longitude: 30 },
    });
    fetch.mockResolvedValueOnce(new Response('', { status: 502 }));
    await expect(placesClient.reverse(50, 30)).rejects.toThrow(
      'Address lookup is unavailable.',
    );
    fetch.mockResolvedValueOnce(
      Response.json({ message: 'Slow down.' }, { status: 429 }),
    );
    await expect(placesClient.search('Kyiv', 'city')).rejects.toThrow(
      'Slow down.',
    );
    expect(lastCall().url).toBe('/places/search?query=Kyiv&kind=city');
    const place = {
      id: 'p',
      label: 'Kyiv',
      city: 'Kyiv',
      region: null,
      address: 'Kyiv',
      latitude: 50.45,
      longitude: 30.52,
    };
    fetch.mockResolvedValueOnce(Response.json({ items: [place] }));
    expect(await placesClient.search('Kyiv', 'city')).toEqual([place]);
  });
});

describe('StorageClient', () => {
  const file = (type: string, size = 10) =>
    new File([new Uint8Array(size)], 'a', { type });

  it('validates images before upload', async () => {
    await expect(
      storageClient.uploadProfileAvatar(file('image/gif')),
    ).rejects.toThrow('Use a PNG, JPEG, or WebP image.');
    await expect(
      storageClient.uploadProfileAvatar(file('image/png', 5 * 1024 * 1024 + 1)),
    ).rejects.toThrow('Images must be 5 MB or smaller.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('uploads with the file type and maps failures', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 201 }));
    const upload = file('image/webp');
    await storageClient.uploadEventImage(E, 'cover', upload);
    expect(fetch).toHaveBeenCalledWith(
      `/backend/api/storage/events/${E}/cover`,
      {
        method: 'PUT',
        headers: { 'content-type': 'image/webp' },
        body: upload,
        credentials: 'include',
      },
    );
    fetch.mockResolvedValueOnce(
      Response.json(
        { code: 'FILE_REJECTED', message: 'Unsafe.' },
        { status: 422 },
      ),
    );
    await expect(
      storageClient.uploadProfileAvatar(file('image/png')),
    ).rejects.toMatchObject({ code: 'FILE_REJECTED' });
  });

  it('removes images and ignores missing ones', async () => {
    fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(storageClient.removeProfileAvatar()).resolves.toBeUndefined();
    fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(storageClient.removeEventImage(E, 'avatar')).rejects.toThrow(
      'Could not remove image.',
    );
  });

  it('parses event image flags', async () => {
    fetch.mockResolvedValueOnce(Response.json({ avatar: true, cover: false }));
    expect(await storageClient.images(E)).toEqual({
      avatar: true,
      cover: false,
    });
  });
});
