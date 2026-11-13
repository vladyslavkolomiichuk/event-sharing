import { randomUUID } from 'node:crypto';
import {
  ANONYMOUS_USER_ID,
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec } from '@event-sharing/messaging';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProducer, kafka, running } from '../../../test/fake-kafka.js';
import { envelope } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import {
  jwks,
  membershipRow,
  policyRow,
  prisma,
  privacyDatabase,
} from './mocks.js';

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
const { RegistrationPolicyConsumer } =
  await import('../src/consumers/RegistrationPolicyConsumer.js');
const { ParticipationOutboxWorker } =
  await import('../src/workers/ParticipationOutboxWorker.js');
const { ParticipationPrivacyHandler } =
  await import('../src/privacy/ParticipationPrivacyHandler.js');

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
const as = async (role = 'USER', sub = randomUUID()) => ({
  sub,
  headers: { authorization: `Bearer ${await jwt.token({ sub, role })}` },
});
const base = '/api/participation';

describe('HTTP API', () => {
  it('serves health and requires a token', async () => {
    expect((await send(app(), 'GET', '/health')).body.service).toBe(
      'Participation',
    );
    expect(
      (await send(createApp({ check: async () => false }), 'GET', '/ready'))
        .status,
    ).toBe(503);
    expect((await send(app(), 'GET', `${base}/me`)).status).toBe(401);
    expect((await send(app(), 'GET', '/missing')).status).toBe(404);
  });

  it('joins, leaves and reads availability', async () => {
    const { sub, headers } = await as();
    const policy = policyRow();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.membership.update.mockResolvedValue(
      membershipRow({ eventId: policy.eventId, userId: sub }),
    );
    const joined = await send(
      app(),
      'POST',
      `${base}/events/${policy.eventId}/join`,
      {},
      headers,
    );
    expect(joined.status).toBe(200);
    expect(joined.body.userId).toBe(sub);
    expect(
      (
        await send(
          app(),
          'POST',
          `${base}/events/${policy.eventId}/join`,
          { x: 1 },
          headers,
        )
      ).status,
    ).toBe(400);
    prisma.membership.findUnique.mockResolvedValue(
      membershipRow({ status: 'LEFT' }),
    );
    expect(
      (
        await send(
          app(),
          'DELETE',
          `${base}/events/${policy.eventId}/join`,
          undefined,
          headers,
        )
      ).body.status,
    ).toBe('LEFT');
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/events/${policy.eventId}/availability`,
          undefined,
          headers,
        )
      ).body.available,
    ).toBe(8);
  });

  it('lists participants, member status and own memberships', async () => {
    const { sub, headers } = await as('ADMIN');
    const policy = policyRow();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.membership.findMany.mockResolvedValue([]);
    prisma.membership.findUnique.mockResolvedValue(null);
    for (const path of [
      `${base}/events/${policy.eventId}/participants`,
      `${base}/me`,
    ]) {
      expect((await send(app(), 'GET', path, undefined, headers)).body).toEqual(
        {
          items: [],
          nextCursor: null,
        },
      );
    }
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/events/${policy.eventId}/members/${sub}`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ status: null, joinedAt: null });
  });

  it('manages invitations and links', async () => {
    const { sub, headers } = await as('ORGANIZER');
    const policy = policyRow({
      organizerId: sub,
      visibility: 'INVITE_ONLY',
      endTime: new Date(Date.now() + 172800000),
    });
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.inviteLink.create.mockImplementation(async ({ data }: any) => ({
      id: randomUUID(),
      ...data,
    }));
    prisma.inviteLink.findMany.mockResolvedValue([]);
    prisma.personalInvite.findMany.mockResolvedValue([]);
    prisma.registrationPolicy.findMany.mockResolvedValue([]);
    const link = await send(
      app(),
      'POST',
      `${base}/events/${policy.eventId}/invite-links`,
      { expiresAt: new Date(Date.now() + 3600000).toISOString() },
      headers,
    );
    expect(link.status).toBe(201);
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/events/${policy.eventId}/invite-links`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual([]);
    expect(
      (
        await send(
          app(),
          'DELETE',
          `${base}/events/${policy.eventId}/invite-links/${randomUUID()}`,
          undefined,
          headers,
        )
      ).status,
    ).toBe(204);
    expect(
      (await send(app(), 'GET', `${base}/invitations`, undefined, headers))
        .body,
    ).toEqual([]);
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/events/${policy.eventId}/invitations`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual([]);
    expect(
      (
        await send(
          app(),
          'POST',
          `${base}/events/${policy.eventId}/invitations`,
          { usernames: [] },
          headers,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/invitations/link/short`,
          undefined,
          headers,
        )
      ).status,
    ).toBe(400);
    const inviteId = randomUUID();
    expect(
      (
        await send(
          app(),
          'POST',
          `${base}/invitations/${inviteId}/decline`,
          {},
          headers,
        )
      ).status,
    ).toBe(204);
    prisma.personalInvite.findUnique.mockResolvedValue({ senderId: sub });
    expect(
      (
        await send(
          app(),
          'DELETE',
          `${base}/invitations/${inviteId}`,
          undefined,
          headers,
        )
      ).status,
    ).toBe(204);
  });

  it('exports own data without link tokens', async () => {
    const { headers } = await as();
    prisma.membership.findMany.mockResolvedValue([]);
    prisma.personalInvite.findMany.mockResolvedValue([]);
    prisma.inviteLink.findMany.mockResolvedValue([]);
    const response = await send(
      app(),
      'GET',
      `${base}/me/export`,
      undefined,
      headers,
    );
    expect(response.body).toEqual({
      memberships: [],
      invitations: [],
      inviteLinks: [],
    });
    expect(
      prisma.inviteLink.findMany.mock.calls[0]![0].select,
    ).not.toHaveProperty('tokenHash');
  });

  it('validates history paging', async () => {
    const { headers } = await as();
    expect(
      (
        await send(
          app(),
          'GET',
          `${base}/users/${randomUUID()}/history?page=-1`,
          undefined,
          headers,
        )
      ).status,
    ).toBe(400);
  });
});

describe('ServiceRequestHandler', () => {
  const rpc = (operation: string, data: unknown = {}, authorization?: string) =>
    ({
      operation,
      sender: 'messages',
      data,
      ...(authorization ? { authorization } : {}),
    }) as never;

  it('answers readiness and membership queries', async () => {
    const handler = new ServiceRequestHandler();
    expect(await handler.handle(rpc(RPC_OPERATIONS.readiness))).toEqual({
      status: 'ok',
      service: 'participation',
    });
    const { headers } = await as('ADMIN');
    prisma.registrationPolicy.findUnique.mockResolvedValue(policyRow());
    prisma.membership.findUnique.mockResolvedValue(null);
    expect(
      await handler.handle(
        rpc(
          RPC_OPERATIONS.membership,
          { eventId: randomUUID(), userId: randomUUID() },
          headers.authorization,
        ),
      ),
    ).toEqual({ status: null, joinedAt: null });
    await expect(
      handler.handle(rpc(RPC_OPERATIONS.profile, {}, headers.authorization)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('RegistrationPolicyConsumer', () => {
  it('applies policy requests and ignores other events', async () => {
    const policies = {
      apply: vi.fn(async () => 'applied'),
      recoverPending: vi.fn(),
    };
    const consumer = new RegistrationPolicyConsumer(['k:1'], policies as never);
    await consumer.start();
    const fake = await running();
    const request = envelope(
      EVENT_TYPES.registrationPolicyRequested,
      'events',
      {
        eventId: randomUUID(),
        organizerId: randomUUID(),
        policyVersion: 1,
        status: 'OPEN',
        capacity: 5,
      },
    );
    await fake.deliver(EVENT_TOPICS.events, EventCodec.encode(request));
    await fake.deliver(
      EVENT_TOPICS.events,
      EventCodec.encode(envelope(EVENT_TYPES.eventCreated, 'events', {})),
    );
    expect(policies.apply).toHaveBeenCalledTimes(1);
    expect(policies.apply.mock.calls[0]![0]).toBe(request.eventId);
    await vi.waitFor(() => expect(policies.recoverPending).toHaveBeenCalled());
    await consumer.stop();
  });
});

describe('ParticipationOutboxWorker', () => {
  it('publishes every participation event type', async () => {
    const worker = new ParticipationOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    const eventId = randomUUID();
    const payloads: [string, unknown][] = [
      [EVENT_TYPES.registrationPolicyApplied, { eventId, policyVersion: 1 }],
      [
        EVENT_TYPES.registrationPolicyRejected,
        { eventId, policyVersion: 1, reason: 'CAPACITY_BELOW_OCCUPIED' },
      ],
      [EVENT_TYPES.userJoined, { eventId, userId: randomUUID() }],
      [
        EVENT_TYPES.invitationSent,
        {
          eventId,
          recipientId: randomUUID(),
          organizerId: randomUUID(),
          title: 'Jazz',
        },
      ],
    ];
    for (const [eventType, payload] of payloads) {
      await worker.publishEvent({
        id: randomUUID(),
        aggregateId: eventId,
        eventType,
        payload,
        occurredAt: new Date(),
      });
    }
    expect(kafka.sent).toHaveLength(4);
    await expect(
      worker.publishEvent({
        id: randomUUID(),
        eventType: 'x',
        payload: {},
        occurredAt: new Date(),
      }),
    ).rejects.toThrow('Unsupported participation event: x');
  });
});

describe('ParticipationPrivacyHandler', () => {
  it('releases seats, removes orphaned events and anonymizes the organizer', async () => {
    const handler = new ParticipationPrivacyHandler(
      privacyDatabase as never,
    ) as any;
    const owned = randomUUID();
    const kept = randomUUID();
    const query = vi.fn(async (sql: string) => {
      if (
        sql.startsWith(
          'SELECT "eventId" FROM registration_policy WHERE "organizerId"',
        )
      )
        return { rows: [{ eventId: owned }, { eventId: kept }] };
      if (sql.startsWith('SELECT DISTINCT'))
        return { rows: [{ eventId: kept }] };
      return { rows: [], rowCount: 0 };
    });
    const userId = randomUUID();
    const result = await handler.erase(
      { query },
      {
        requestId: randomUUID(),
        userId,
        eventIds: [],
        removedEventIds: [],
        mailRequestIds: [],
      },
    );
    expect(result).toEqual({
      eventIds: [owned, kept].sort(),
      removedEventIds: [owned],
    });
    const statements = query.mock.calls.map((call) => call[0] as string);
    expect(
      statements.some((sql) => sql.includes('GREATEST(0, occupied - 1)')),
    ).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE personal_invite SET "senderId" = $2'),
      [userId, ANONYMOUS_USER_ID],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO privacy_deleted_event'),
      [owned],
    );
  });
});
