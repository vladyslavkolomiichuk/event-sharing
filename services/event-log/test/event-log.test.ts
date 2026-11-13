import { randomUUID } from 'node:crypto';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec } from '@event-sharing/messaging';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { kafka, running } from '../../../test/fake-kafka.js';
import { envelope, eventDetail } from '../../../test/fixtures.js';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);

const { EventLogSummaryFactory } =
  await import('../src/domain/EventLogSummaryFactory.js');
const { EventLogRepository } =
  await import('../src/repositories/EventLogRepository.js');
const { EventLogReadRepository } =
  await import('../src/repositories/EventLogReadRepository.js');
const { EventLogListQuerySchema, EventLogAnalyticsQuerySchema } =
  await import('../src/schemas/event-log-query.schema.js');
const { EventLogRetentionWorker } =
  await import('../src/workers/EventLogRetentionWorker.js');
const { EventLogConsumer } =
  await import('../src/consumers/EventLogConsumer.js');
const { EventLogPrivacyHandler } =
  await import('../src/privacy/EventLogPrivacyHandler.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { createApp } = await import('../src/app.js');

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

const snapshot = (overrides = {}) => {
  const {
    moderationReason: _m,
    policyError: _p,
    pendingStatus: _s,
    pendingRegistrationStatus: _r,
    pendingParticipantLimit: _l,
    ...detail
  } = eventDetail(overrides);
  return detail;
};

describe('EventLogSummaryFactory', () => {
  const userId = randomUUID();
  const eventId = randomUUID();

  it.each([
    [
      EVENT_TYPES.userRegistered,
      'auth',
      { userId, role: 'USER' },
      { actorId: userId, details: { role: 'USER' } },
    ],
    [
      EVENT_TYPES.userRoleChanged,
      'auth',
      { userId, role: 'ADMIN' },
      { actorId: null, subjectUserId: userId },
    ],
    [
      EVENT_TYPES.userJoined,
      'participation',
      { eventId, userId },
      { actorId: userId, relatedEventId: eventId },
    ],
    [
      EVENT_TYPES.registrationPolicyRejected,
      'participation',
      { eventId, policyVersion: 2, reason: 'CAPACITY_BELOW_OCCUPIED' },
      {
        relatedEventId: eventId,
        details: { policyVersion: 2, reason: 'CAPACITY_BELOW_OCCUPIED' },
      },
    ],
    [
      EVENT_TYPES.searchPerformed,
      'geo-search',
      { hasText: true, hasCategory: false, hasLocation: true, resultCount: 4 },
      {
        details: {
          hasText: true,
          hasCategory: false,
          hasLocation: true,
          resultCount: 4,
        },
      },
    ],
    [
      EVENT_TYPES.notificationFailed,
      'notifications',
      { requestId: randomUUID(), channel: 'EMAIL', reason: 'EXPIRED' },
      { details: { channel: 'EMAIL', reason: 'EXPIRED' } },
    ],
  ] as const)('summarizes %s', (type, producer, payload, expected) => {
    expect(
      EventLogSummaryFactory.create(envelope(type, producer, payload)),
    ).toMatchObject(expected);
  });

  it('keeps only safe snapshot fields', () => {
    const payload = snapshot({ categoryName: null });
    const summary = EventLogSummaryFactory.create(
      envelope(EVENT_TYPES.eventCreated, 'events', payload),
    );
    expect(summary).toEqual({
      actorId: payload.organizerId,
      subjectUserId: payload.organizerId,
      relatedEventId: payload.id,
      summary: 'event created',
      details: { status: 'PUBLISHED', category: 'Uncategorized', version: 1 },
    });
    expect(JSON.stringify(summary)).not.toContain('Khreshchatyk');
  });

  it('falls back to the event name for unknown or invalid payloads', () => {
    expect(
      EventLogSummaryFactory.create(
        envelope(EVENT_TYPES.userRegistered, 'auth', { bad: true }),
      ),
    ).toEqual({
      actorId: null,
      subjectUserId: null,
      relatedEventId: null,
      summary: 'user registered',
      details: {},
    });
  });
});

describe('EventLogRepository', () => {
  it('records new events with consumer progress', async () => {
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    const event = envelope(EVENT_TYPES.userNameUpdated, 'auth', {
      userId: randomUUID(),
      name: 'Olena',
    });
    expect(
      await new EventLogRepository().record(event, 'topic', 0, '42', 365),
    ).toBe('processed');
    expect(
      prisma.consumerProgress.upsert.mock.calls[0]![0].create.lastOffset,
    ).toBe(42n);
    expect(prisma.eventLogEntry.create.mock.calls[0]![0].data).toMatchObject({
      id: event.eventId,
      offset: 42n,
    });
  });

  it('keeps the highest offset and skips duplicates and old events', async () => {
    prisma.consumerProgress.findUnique.mockResolvedValue({ lastOffset: 100n });
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 0 });
    const event = envelope(EVENT_TYPES.userNameUpdated, 'auth', {});
    expect(await new EventLogRepository().record(event, 't', 0, '7', 365)).toBe(
      'duplicate',
    );
    expect(prisma.consumerProgress.upsert).not.toHaveBeenCalled();
    const old = envelope(
      EVENT_TYPES.userNameUpdated,
      'auth',
      {},
      { occurredAt: '2020-01-01T00:00:00.000Z' },
    );
    expect(await new EventLogRepository().record(old, 't', 0, '200', 30)).toBe(
      'ignored',
    );
  });

  it('deletes expired entries', async () => {
    prisma.$transaction.mockResolvedValueOnce([{ count: 3 }, { count: 3 }]);
    expect(await new EventLogRepository().deleteExpired(30)).toBe(3);
  });
});

describe('EventLogReadRepository', () => {
  const entry = (overrides = {}) => ({
    id: randomUUID(),
    eventType: EVENT_TYPES.userNameUpdated,
    producer: 'auth',
    topic: EVENT_TOPICS.identity,
    occurredAt: new Date('2026-11-01T10:00:00.000Z'),
    receivedAt: new Date('2026-11-01T10:00:01.000Z'),
    actorId: null,
    subjectUserId: null,
    relatedEventId: null,
    summary: 'user name updated',
    details: {},
    ...overrides,
  });

  it('pages entries with an opaque cursor', async () => {
    const rows = [entry(), entry()];
    prisma.eventLogEntry.findMany.mockResolvedValue(rows);
    const query = EventLogListQuerySchema.parse({
      limit: '1',
      producer: 'auth',
    });
    const page = await new EventLogReadRepository().list(query);
    expect(page.items).toHaveLength(1);
    await new EventLogReadRepository().list({
      ...query,
      cursor: page.nextCursor!,
    });
    expect(
      prisma.eventLogEntry.findMany.mock.calls[1]![0].where.OR[1].id,
    ).toEqual({ lt: rows[0]!.id });
    await expect(
      new EventLogReadRepository().list({ ...query, cursor: 'bad' }),
    ).rejects.toMatchObject({
      code: 'INVALID_CURSOR',
    });
  });

  it('builds analytics from grouped counts', async () => {
    prisma.eventLogEntry.groupBy.mockResolvedValue([
      { eventType: EVENT_TYPES.searchPerformed, _count: { _all: 5 } },
    ]);
    prisma.consumerProgress.findMany.mockResolvedValue([
      { topic: 't', partition: 0, lastOffset: 9n, receivedAt: new Date() },
    ]);
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          day: new Date('2026-11-01'),
          eventType: EVENT_TYPES.searchPerformed,
          count: 5n,
        },
      ])
      .mockResolvedValueOnce([{ name: 'Music', count: 2n }])
      .mockResolvedValueOnce([{ name: 'PUBLISHED', count: 3n }])
      .mockResolvedValueOnce([{ count: 4n }])
      .mockResolvedValueOnce([
        {
          withLocation: 1n,
          withText: 2n,
          withCategory: 0n,
          zeroResults: 1n,
          resultsShown: 10n,
        },
      ]);
    const result = await new EventLogReadRepository().analytics(7);
    expect(result).toMatchObject({
      days: 7,
      activeActors: 4,
      totals: { [EVENT_TYPES.searchPerformed]: 5 },
      daily: [{ day: '2026-11-01', count: 5 }],
      search: { resultsShown: 10 },
      progress: [{ lastOffset: '9' }],
    });
  });
});

describe('query schemas', () => {
  it('validate ranges and analytics periods', () => {
    expect(
      EventLogListQuerySchema.safeParse({
        from: '2026-12-02T00:00:00.000Z',
        to: '2026-12-01T00:00:00.000Z',
      }).success,
    ).toBe(false);
    expect(EventLogAnalyticsQuerySchema.parse({})).toEqual({ days: 30 });
    expect(EventLogAnalyticsQuerySchema.safeParse({ days: '14' }).success).toBe(
      false,
    );
  });
});

describe('workers and consumer', () => {
  it('removes expired entries on start and survives errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const repository = {
      deleteExpired: vi
        .fn()
        .mockResolvedValueOnce(2)
        .mockRejectedValueOnce(new Error('db')),
    };
    const worker = new EventLogRetentionWorker(repository as never, 30);
    worker.start();
    await vi.waitFor(() =>
      expect(console.info).toHaveBeenCalledWith(
        'Event Log removed 2 expired entries.',
      ),
    );
    worker.stop();
  });

  it('records every consumed event with its offset', async () => {
    const repository = { record: vi.fn(async () => 'processed') };
    const consumer = new EventLogConsumer(['k:1'], repository as never, 365);
    await consumer.start();
    const fake = await running();
    const event = envelope(EVENT_TYPES.userNameUpdated, 'auth', {
      userId: randomUUID(),
      name: 'O',
    });
    await fake.deliver(EVENT_TOPICS.identity, EventCodec.encode(event));
    expect(repository.record).toHaveBeenCalledWith(
      event,
      EVENT_TOPICS.identity,
      0,
      '0',
      365,
    );
    await consumer.stop();
  });
});

describe('HTTP API', () => {
  const app = () => createApp({ check: async () => true });
  const as = async (role: string, sub = randomUUID()) => ({
    authorization: `Bearer ${await jwt.token({ role, sub })}`,
  });

  it('lets only admins read the log', async () => {
    expect((await send(app(), 'GET', '/api/event-log/entries')).status).toBe(
      401,
    );
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/event-log/entries',
          undefined,
          await as('USER'),
        )
      ).status,
    ).toBe(403);
    prisma.eventLogEntry.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/event-log/entries',
          undefined,
          await as('ADMIN'),
        )
      ).body,
    ).toEqual({ items: [], nextCursor: null });
  });

  it('exports entries about the caller', async () => {
    const sub = randomUUID();
    prisma.eventLogEntry.findMany.mockResolvedValue([{ id: 'e', offset: 5n }]);
    const response = await send(
      app(),
      'GET',
      '/api/event-log/me/export',
      undefined,
      await as('USER', sub),
    );
    expect(response.body).toEqual({ entries: [{ id: 'e', offset: '5' }] });
    expect(prisma.eventLogEntry.findMany.mock.calls[0]![0].where.OR).toEqual([
      { actorId: sub },
      { subjectUserId: sub },
    ]);
    expect((await send(app(), 'GET', '/api/event-log/me/export')).status).toBe(
      401,
    );
  });
});

describe('privacy and RPC', () => {
  it('deletes entries mentioning the user', async () => {
    const query = vi.fn();
    const work = { userId: randomUUID(), removedEventIds: [randomUUID()] };
    expect(
      await (new EventLogPrivacyHandler(privacyDatabase as never) as any).erase(
        { query },
        work,
      ),
    ).toEqual({});
    expect(query.mock.calls[0]![1]).toEqual([
      work.userId,
      work.removedEventIds,
    ]);
  });

  it('answers readiness', async () => {
    const handler = new ServiceRequestHandler();
    expect(
      await handler.handle({ operation: RPC_OPERATIONS.readiness } as never),
    ).toEqual({
      status: 'ok',
      service: 'event-log',
    });
    await expect(
      handler.handle({ operation: RPC_OPERATIONS.profile } as never),
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});
