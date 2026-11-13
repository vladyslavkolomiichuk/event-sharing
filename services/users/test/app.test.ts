import { randomUUID } from 'node:crypto';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec } from '@event-sharing/messaging';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProducer, kafka, running } from '../../../test/fake-kafka.js';
import { envelope } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase, snapshot } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);

const { createApp } = await import('../src/app.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { IdentityEventConsumer } =
  await import('../src/consumers/IdentityEventConsumer.js');
const { UserProfileOutboxWorker } =
  await import('../src/workers/UserProfileOutboxWorker.js');
const { UserPrivacyHandler } =
  await import('../src/privacy/UserPrivacyHandler.js');

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
beforeEach(() => {
  prisma.reset();
  kafka.reset();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

const app = () => createApp({ check: async () => true });
const as = async (sub = randomUUID()) => ({
  sub,
  headers: { authorization: `Bearer ${await jwt.token({ sub })}` },
});
const own = (userId: string) => {
  const value = snapshot({ userId });
  prisma.userProfile.findUnique.mockResolvedValue(value.profile);
  prisma.userPreference.findUnique.mockResolvedValue(value.preferences);
  return value;
};

describe('HTTP API', () => {
  it('serves health and requires a token', async () => {
    expect((await send(app(), 'GET', '/health')).status).toBe(200);
    expect(
      (await send(createApp({ check: async () => false }), 'GET', '/ready'))
        .status,
    ).toBe(503);
    expect((await send(app(), 'GET', '/api/users/me')).status).toBe(401);
  });

  it('reads, exports and updates the own profile', async () => {
    const { sub, headers } = await as();
    own(sub);
    expect(
      (await send(app(), 'GET', '/api/users/me', undefined, headers)).body
        .userId,
    ).toBe(sub);
    prisma.friendRequest.findMany.mockResolvedValue([]);
    prisma.friendship.findMany.mockResolvedValue([]);
    prisma.userBlock.findMany.mockResolvedValue([]);
    const exported = await send(
      app(),
      'GET',
      '/api/users/me/export',
      undefined,
      headers,
    );
    expect(exported.body).toMatchObject({
      friendRequests: [],
      friendships: [],
      blocks: [],
    });
    expect(exported.headers.get('cache-control')).toBe('no-store');
    const value = snapshot({ userId: sub, city: 'Lviv' });
    prisma.userProfile.update.mockResolvedValue(value.profile);
    prisma.userPreference.findUniqueOrThrow.mockResolvedValue(
      value.preferences,
    );
    expect(
      (await send(app(), 'PATCH', '/api/users/me', { city: 'Lviv' }, headers))
        .body.city,
    ).toBe('Lviv');
    expect(
      (await send(app(), 'PATCH', '/api/users/me', {}, headers)).status,
    ).toBe(400);
  });

  it('reads public profiles by id, username and list', async () => {
    const { headers } = await as();
    const other = snapshot();
    prisma.userProfile.findUnique.mockResolvedValue(other.profile);
    prisma.userPreference.findUnique.mockResolvedValue(other.preferences);
    prisma.friendship.findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([]);
    prisma.userBlock.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          `/api/users/${other.profile.userId}`,
          undefined,
          headers,
        )
      ).body.phone,
    ).toBeNull();
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/users/by-username/iryna_melnyk',
          undefined,
          headers,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await send(
          app(),
          'GET',
          `/api/users/${other.profile.userId}/history-access`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ allowed: true });
    prisma.userProfile.findMany.mockResolvedValue([]);
    prisma.userPreference.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          `/api/users?ids=${randomUUID()}`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual([]);
    expect(
      (await send(app(), 'GET', '/api/users?ids=bad', undefined, headers))
        .status,
    ).toBe(400);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/users/search?username=ir',
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ items: [], nextCursor: null });
  });

  it('runs friend actions', async () => {
    const { headers } = await as();
    prisma.$queryRaw.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/users/friends/search?q=ol',
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ items: [], nextPage: null });
    for (const name of [
      'friendship',
      'userBlock',
      'userProfile',
      'userPreference',
    ])
      prisma[name].findMany.mockResolvedValue([]);
    prisma.friendRequest.findMany.mockResolvedValue([]);
    expect(
      (await send(app(), 'GET', '/api/users/friends', undefined, headers)).body
        .friends,
    ).toEqual([]);
    prisma.userProfile.findUnique.mockResolvedValue({
      userId: randomUUID(),
      username: 'olena',
    });
    expect(
      (await send(app(), 'PUT', '/api/users/blocks/olena', undefined, headers))
        .status,
    ).toBe(204);
    expect(
      (
        await send(
          app(),
          'DELETE',
          '/api/users/blocks/olena',
          undefined,
          headers,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await send(
          app(),
          'DELETE',
          '/api/users/friends/olena',
          undefined,
          headers,
        )
      ).status,
    ).toBe(204);
    expect(
      (
        await send(
          app(),
          'POST',
          '/api/users/friends/requests',
          { username: '1' },
          headers,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          app(),
          'PATCH',
          `/api/users/friends/requests/${randomUUID()}`,
          { action: 'X' },
          headers,
        )
      ).status,
    ).toBe(400);
  });
});

describe('ServiceRequestHandler', () => {
  const rpc = (operation: string, data: unknown, authorization?: string) =>
    ({
      operation,
      sender: 'participation',
      data,
      ...(authorization ? { authorization } : {}),
    }) as never;

  it('answers profile, history and invitation target queries', async () => {
    const handler = new ServiceRequestHandler();
    expect(await handler.handle(rpc(RPC_OPERATIONS.readiness, {}))).toEqual({
      status: 'ok',
      service: 'users',
    });
    const { sub, headers } = await as();
    own(sub);
    expect(
      await handler.handle(
        rpc(RPC_OPERATIONS.profile, { userId: sub }, headers.authorization),
      ),
    ).toMatchObject({ userId: sub });
    expect(
      await handler.handle(
        rpc(
          RPC_OPERATIONS.historyAccess,
          { userId: sub },
          headers.authorization,
        ),
      ),
    ).toEqual({ allowed: true });
    await expect(
      handler.handle(
        rpc(
          RPC_OPERATIONS.invitationTarget,
          { username: 'iryna_melnyk' },
          headers.authorization,
        ),
      ),
    ).rejects.toThrow('You cannot invite yourself.');
    await expect(
      handler.handle(
        rpc(RPC_OPERATIONS.eventDetail, { userId: sub }, headers.authorization),
      ),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('IdentityEventConsumer', () => {
  it('provisions and renames profiles from Auth events', async () => {
    const repository = {
      provision: vi.fn(async () => true),
      updateName: vi.fn(async () => false),
      updateUsername: vi.fn(async () => true),
    };
    const consumer = new IdentityEventConsumer(['k:1'], repository as never);
    await consumer.start();
    const fake = await running();
    const userId = randomUUID();
    const deliver = (type: any, payload: unknown) =>
      fake.deliver(
        EVENT_TOPICS.identity,
        EventCodec.encode(envelope(type, 'auth', payload)),
      );
    await deliver(EVENT_TYPES.userRegistered, {
      userId,
      role: 'USER',
      username: 'iryna',
    });
    await deliver(EVENT_TYPES.userNameUpdated, { userId, name: 'Iryna' });
    await deliver(EVENT_TYPES.userUsernameUpdated, {
      userId,
      username: 'iryna_m',
    });
    await deliver(EVENT_TYPES.userRoleChanged, { userId, role: 'ADMIN' });
    expect(repository.provision).toHaveBeenCalledWith(
      expect.any(String),
      userId,
      EVENT_TYPES.userRegistered,
      undefined,
      'iryna',
    );
    expect(repository.updateName).toHaveBeenCalled();
    expect(repository.updateUsername.mock.calls[0]![2]).toBe('iryna_m');
    await consumer.stop();
  });
});

describe('UserProfileOutboxWorker', () => {
  it('publishes ordered profile and friend events', async () => {
    const worker = new UserProfileOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    const userId = randomUUID();
    await worker.publishEvent({
      id: randomUUID(),
      aggregateId: userId,
      eventType: EVENT_TYPES.userProfileUpdated,
      payload: {
        userId,
        profileVersion: 1,
        city: null,
        notificationsEnabled: true,
      },
      occurredAt: new Date(),
      ordered: true,
      previousEventId: null,
      redacted: false,
    });
    const sent = EventCodec.decode(kafka.sent[0]!.messages[0]!.value);
    expect(sent.delivery).toEqual({
      stream: `users:${userId}`,
      previousEventId: null,
    });
    await worker.publishEvent({
      id: randomUUID(),
      aggregateId: userId,
      eventType: EVENT_TYPES.friendRequested,
      payload: { secret: true },
      occurredAt: new Date(),
      ordered: false,
      redacted: true,
    });
    expect(
      EventCodec.decode(kafka.sent[1]!.messages[0]!.value).payload,
    ).toEqual({});
    await expect(
      worker.publishEvent({
        id: randomUUID(),
        eventType: 'x',
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('Unsupported user event type: x');
  });
});

describe('UserPrivacyHandler', () => {
  it('deletes social data and the profile', async () => {
    const query = vi.fn();
    const userId = randomUUID();
    const handler = new UserPrivacyHandler(privacyDatabase as never) as any;
    expect(await handler.erase({ query }, { userId })).toEqual({});
    const statements = query.mock.calls.map((call) => call[0]);
    expect(statements).toEqual([
      expect.stringContaining('DELETE FROM friend_request'),
      expect.stringContaining('DELETE FROM friendship'),
      expect.stringContaining('DELETE FROM user_block'),
      expect.stringContaining('DELETE FROM user_profile'),
    ]);
  });
});
