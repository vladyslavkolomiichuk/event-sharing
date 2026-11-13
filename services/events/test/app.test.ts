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
import { eventRow, jwks, prisma, privacyDatabase } from './rows.js';

vi.mock('../src/database/client.js', () => import('./rows.js'));
vi.mock('../src/config/service-bus.js', () => import('./rows.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const rows = await import('./rows.js');
  return { internalJwks: (...args: unknown[]) => rows.jwks.current(...args) };
});
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);

const { createApp } = await import('../src/app.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { ParticipationEventConsumer } =
  await import('../src/consumers/ParticipationEventConsumer.js');
const { EventLifecycleWorker } =
  await import('../src/workers/EventLifecycleWorker.js');
const { EventOutboxWorker } =
  await import('../src/workers/EventOutboxWorker.js');
const { EventPrivacyHandler } =
  await import('../src/privacy/EventPrivacyHandler.js');

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
beforeEach(() => {
  prisma.reset();
  kafka.reset();
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

const app = () => createApp({ check: async () => true });
const as = async (role = 'ORGANIZER', sub = randomUUID()) => ({
  sub,
  headers: { authorization: `Bearer ${await jwt.token({ sub, role })}` },
});

describe('public routes', () => {
  it('serves health, readiness and 404', async () => {
    expect((await send(app(), 'GET', '/health')).body.service).toBe('Events');
    const down = await send(
      createApp({ check: async () => false }),
      'GET',
      '/ready',
    );
    expect(down.status).toBe(503);
    expect((await send(app(), 'GET', '/nope')).status).toBe(404);
  });

  it('serves the public map with a bounded limit', async () => {
    const response = await send(app(), 'GET', '/api/public/events/map?limit=5');
    expect(response.body).toEqual({ items: [], nextCursor: null });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(
      (await send(app(), 'GET', '/api/public/events/map?limit=500')).status,
    ).toBe(400);
  });

  it('reports availability', async () => {
    const id = randomUUID();
    expect(
      (await send(app(), 'GET', `/api/public/events/${id}/availability`))
        .status,
    ).toBe(404);
    prisma.event.findFirst.mockResolvedValue({ id });
    expect(
      (await send(app(), 'GET', `/api/public/events/${id}/availability`))
        .status,
    ).toBe(204);
  });
});

describe('event routes', () => {
  it('require a token', async () => {
    expect((await send(app(), 'GET', '/api/events')).status).toBe(401);
  });

  it('list categories and events', async () => {
    const { headers } = await as();
    prisma.category.findMany.mockResolvedValue([]);
    prisma.event.findMany.mockResolvedValue([]);
    expect(
      (await send(app(), 'GET', '/api/events/categories', undefined, headers))
        .body,
    ).toEqual([]);
    for (const path of [
      '/api/events',
      '/api/events/mine',
      `/api/events/organizer/${randomUUID()}`,
    ]) {
      expect((await send(app(), 'GET', path, undefined, headers)).body).toEqual(
        {
          items: [],
          nextCursor: null,
        },
      );
    }
  });

  it('create events with 201 and validate input', async () => {
    const { sub, headers } = await as();
    const start = new Date(Date.now() + 86400000);
    const body = {
      title: 'Jazz',
      description: 'Music',
      startTime: start.toISOString(),
      endTime: new Date(start.getTime() + 3600000).toISOString(),
      location: { address: 'A', latitude: 1, longitude: 2 },
      participantLimit: 5,
    };
    prisma.event.create.mockResolvedValue(eventRow({ organizerId: sub }));
    const created = await send(app(), 'POST', '/api/events', body, headers);
    expect(created.status).toBe(201);
    const invalid = await send(
      app(),
      'POST',
      '/api/events',
      { ...body, title: '' },
      headers,
    );
    expect(invalid.status).toBe(400);
  });

  it('let only admins create categories and read moderation', async () => {
    const organizer = await as();
    expect(
      (
        await send(
          app(),
          'POST',
          '/api/events/categories',
          { name: 'Art' },
          organizer.headers,
        )
      ).status,
    ).toBe(403);
    const admin = await as('ADMIN');
    prisma.category.create.mockResolvedValue({ id: randomUUID(), name: 'Art' });
    expect(
      (
        await send(
          app(),
          'POST',
          '/api/events/categories',
          { name: 'Art' },
          admin.headers,
        )
      ).status,
    ).toBe(201);
    prisma.event.findMany.mockResolvedValue([]);
    prisma.event.count.mockResolvedValue(0);
    const moderation = await send(
      app(),
      'GET',
      '/api/events/moderation',
      undefined,
      admin.headers,
    );
    expect(moderation.body.total).toBe(0);
    expect(moderation.headers.get('cache-control')).toBe('no-store');
  });

  it('answer the deletion check and export', async () => {
    const { headers } = await as();
    prisma.event.findFirst.mockResolvedValue(null);
    prisma.event.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/events/mine/deletion-check',
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ hasActiveEvents: false });
    expect(
      (await send(app(), 'GET', '/api/events/mine/export', undefined, headers))
        .body,
    ).toEqual({
      events: [],
    });
  });

  it('get, update and toggle chat for owned events', async () => {
    const { sub, headers } = await as();
    const row = eventRow({ organizerId: sub });
    prisma.event.findUnique.mockResolvedValue(row);
    prisma.event.update.mockResolvedValue({ ...row, title: 'New' });
    expect(
      (await send(app(), 'GET', `/api/events/${row.id}`, undefined, headers))
        .body.id,
    ).toBe(row.id);
    expect(
      (
        await send(
          app(),
          'PATCH',
          `/api/events/${row.id}`,
          { title: 'New' },
          headers,
        )
      ).body.title,
    ).toBe('New');
    expect(
      (
        await send(
          app(),
          'PATCH',
          `/api/events/${row.id}/chat`,
          { chatEnabled: true },
          headers,
        )
      ).status,
    ).toBe(200);
    expect(
      (await send(app(), 'GET', '/api/events/not-a-uuid', undefined, headers))
        .status,
    ).toBe(400);
  });

  it('run actions and answer 202 while a policy is pending', async () => {
    const { sub, headers } = await as();
    const row = eventRow({ organizerId: sub, status: 'PUBLISHED' });
    prisma.event.findUnique.mockResolvedValue(row);
    prisma.event.update.mockResolvedValue({
      ...row,
      pendingStatus: 'PUBLISHED',
    });
    prisma.outboxEvent.create.mockResolvedValue({ id: randomUUID() });
    const opened = await send(
      app(),
      'POST',
      `/api/events/${row.id}/registration/open`,
      {},
      headers,
    );
    expect(opened.status).toBe(202);
    const extra = await send(
      app(),
      'POST',
      `/api/events/${row.id}/submit`,
      { a: 1 },
      headers,
    );
    expect(extra.status).toBe(400);
    const noReason = await send(
      app(),
      'POST',
      `/api/events/${row.id}/cancel`,
      {},
      headers,
    );
    expect(noReason.status).toBe(400);
  });
});

describe('ServiceRequestHandler', () => {
  const rpc = (operation: string, data: unknown = {}, authorization?: string) =>
    ({
      kind: 'request',
      id: randomUUID(),
      sender: 'geo-search',
      target: 'events',
      operation,
      deadline: Date.now() + 1000,
      data,
      ...(authorization ? { authorization } : {}),
    }) as never;

  it('answers readiness and public visibility without a user', async () => {
    const handler = new ServiceRequestHandler();
    expect(await handler.handle(rpc(RPC_OPERATIONS.readiness))).toEqual({
      status: 'ok',
      service: 'events',
    });
    prisma.event.findFirst.mockResolvedValue(null);
    expect(
      await handler.handle(
        rpc(RPC_OPERATIONS.publicEvent, { eventId: randomUUID() }),
      ),
    ).toEqual({ visible: false });
  });

  it('answers user queries with a valid token', async () => {
    const handler = new ServiceRequestHandler();
    const { sub, headers } = await as();
    await expect(
      handler.handle(rpc(RPC_OPERATIONS.activeEvents)),
    ).rejects.toMatchObject({
      statusCode: 401,
    });
    prisma.event.findFirst.mockResolvedValue({ id: 'e1' });
    expect(
      await handler.handle(
        rpc(RPC_OPERATIONS.activeEvents, {}, headers.authorization),
      ),
    ).toEqual({ hasActiveEvents: true });
    const row = eventRow({ organizerId: sub });
    prisma.event.findUnique.mockResolvedValue(row);
    expect(
      await handler.handle(
        rpc(
          RPC_OPERATIONS.eventDetail,
          { eventId: row.id },
          headers.authorization,
        ),
      ),
    ).toMatchObject({ id: row.id });
    await expect(
      handler.handle(rpc(RPC_OPERATIONS.profile, {}, headers.authorization)),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('ParticipationEventConsumer', () => {
  it('routes policy results and membership events', async () => {
    const events = { applyPolicyResult: vi.fn(async () => 'applied') };
    const access = {
      apply: vi.fn(async () => 'processed'),
      recoverPending: vi.fn(),
    };
    const consumer = new ParticipationEventConsumer(
      ['k:1'],
      events as never,
      access as never,
    );
    await consumer.start();
    const fake = await running();
    const eventId = randomUUID();
    const deliver = (type: any, payload: unknown) =>
      fake.deliver(
        EVENT_TOPICS.participation,
        EventCodec.encode(envelope(type, 'participation', payload)),
      );
    await deliver(EVENT_TYPES.registrationPolicyApplied, {
      eventId,
      policyVersion: 1,
    });
    await deliver(EVENT_TYPES.registrationPolicyRejected, {
      eventId,
      policyVersion: 1,
      reason: 'CAPACITY_BELOW_OCCUPIED',
    });
    await deliver(EVENT_TYPES.userJoined, { eventId, userId: randomUUID() });
    await deliver(EVENT_TYPES.invitationSent, {});
    expect(events.applyPolicyResult).toHaveBeenCalledTimes(2);
    expect(access.apply).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(access.recoverPending).toHaveBeenCalled());
    await consumer.stop();
    expect(fake.disconnect).toHaveBeenCalled();
  });
});

describe('workers', () => {
  it('advances due events and survives failures', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const events = {
      advanceDueEvents: vi.fn().mockRejectedValueOnce(new Error('db')),
    };
    const worker = new EventLifecycleWorker(events as never);
    worker.start();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(events.advanceDueEvents).toHaveBeenCalledTimes(2);
    worker.stop();
    vi.useRealTimers();
  });

  it('publishes snapshots and policy requests', async () => {
    const worker = new EventOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    await worker.loadPending();
    expect(prisma.outboxEvent.findMany).toHaveBeenCalled();
    const row = eventRow({ status: 'PUBLISHED' });
    const { EventResponseFactory } =
      await import('../src/services/EventResponseFactory.js');
    const record = {
      id: randomUUID(),
      aggregateId: row.id,
      eventType: EVENT_TYPES.eventCreated,
      occurredAt: new Date(),
      payload: new EventResponseFactory().publicSnapshot(row),
    };
    await worker.publishEvent(record);
    expect(kafka.sent[0]).toMatchObject({
      topic: EVENT_TOPICS.events,
      messages: [{ key: row.id }],
    });
    await worker.publishEvent({
      ...record,
      id: randomUUID(),
      eventType: EVENT_TYPES.registrationPolicyRequested,
      payload: {
        eventId: row.id,
        organizerId: row.organizerId,
        policyVersion: 1,
        status: 'OPEN',
        capacity: 5,
      },
    });
    expect(kafka.sent).toHaveLength(2);
    await expect(
      worker.publishEvent({ ...record, eventType: 'x' }),
    ).rejects.toThrow('Unsupported Events event: x');
  });
});

describe('EventPrivacyHandler', () => {
  const work = () => ({
    requestId: randomUUID(),
    userId: randomUUID(),
    eventIds: [],
    removedEventIds: [randomUUID()],
    mailRequestIds: [],
  });

  it('blocks deletion while events are active', async () => {
    const handler = new EventPrivacyHandler(privacyDatabase as never) as any;
    const query = vi.fn(async (sql: string) =>
      sql.includes('status IN')
        ? { rowCount: 1, rows: [] }
        : { rowCount: 0, rows: [] },
    );
    await expect(handler.reserve({ query }, work())).rejects.toMatchObject({
      code: 'ACTIVE_EVENTS_BLOCK_DELETION',
    });
  });

  it('reserves and lists owned events', async () => {
    const handler = new EventPrivacyHandler(privacyDatabase as never) as any;
    const query = vi.fn(async (sql: string) =>
      sql.startsWith(
        'SELECT id FROM event WHERE "organizerId" = $1 ORDER BY id',
      )
        ? { rowCount: 1, rows: [{ id: 'e1' }] }
        : { rowCount: 0, rows: [] },
    );
    expect(await handler.reserve({ query }, work())).toEqual({
      eventIds: ['e1'],
      removedEventIds: [],
    });
  });

  it('erases only with a reservation and anonymizes the organizer', async () => {
    const handler = new EventPrivacyHandler(privacyDatabase as never) as any;
    const missing = vi.fn(async () => ({ rowCount: 0, rows: [] }));
    await expect(
      handler.erase({ query: missing }, work()),
    ).rejects.toMatchObject({
      code: 'PRIVACY_RESERVATION_REQUIRED',
    });
    const query = vi.fn(async () => ({ rowCount: 1, rows: [] }));
    const input = work();
    expect(await handler.erase({ query }, input)).toEqual({
      eventIds: [],
      removedEventIds: input.removedEventIds,
    });
    expect(query.mock.calls.at(-1)).toEqual([
      expect.stringContaining('UPDATE event SET "organizerId" = $2'),
      [input.userId, ANONYMOUS_USER_ID],
    ]);
  });
});
