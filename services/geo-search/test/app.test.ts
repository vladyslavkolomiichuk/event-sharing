import { randomUUID } from 'node:crypto';
import {
  ANONYMOUS_USER_ID,
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import { jwks, prisma, privacyDatabase } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});

const { createApp } = await import('../src/app.js');
const { SearchOutboxWorker } =
  await import('../src/workers/SearchOutboxWorker.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { SearchPrivacyHandler } =
  await import('../src/privacy/SearchPrivacyHandler.js');

let jwt: TestJwt;
beforeAll(async () => {
  jwt = await createTestJwt();
  jwks.current = jwt.jwks;
});
beforeEach(() => {
  prisma.reset();
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

const ready = (value: boolean) => ({ check: vi.fn(async () => value) });
const auth = async (claims = {}) => ({
  authorization: `Bearer ${await jwt.token(claims)}`,
});

describe('health endpoints', () => {
  it('reports health and readiness', async () => {
    expect((await send(createApp(ready(true)), 'GET', '/health')).body).toEqual(
      {
        service: 'Geo Search',
        status: 'ok',
      },
    );
    const down = await send(createApp(ready(false)), 'GET', '/ready');
    expect(down.status).toBe(503);
    expect(down.body.status).toBe('unavailable');
  });

  it('returns JSON 404s', async () => {
    const response = await send(createApp(ready(true)), 'GET', '/missing');
    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

describe('search routes', () => {
  it('requires a valid internal token', async () => {
    const response = await send(
      createApp(ready(true)),
      'GET',
      '/api/search/preference',
    );
    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHORIZED');
  });

  it('rejects deleted accounts', async () => {
    privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 1 });
    const response = await send(
      createApp(ready(true)),
      'GET',
      '/api/search/preference',
      undefined,
      await auth(),
    );
    expect(response.status).toBe(410);
  });

  it('reads and saves the preference', async () => {
    const app = createApp(ready(true));
    const headers = await auth();
    prisma.searchPreference.findUnique.mockResolvedValue(null);
    expect(
      (await send(app, 'GET', '/api/search/preference', undefined, headers))
        .body,
    ).toEqual({ mode: 'UNSET' });
    const saved = await send(
      app,
      'PUT',
      '/api/search/preference',
      { mode: 'CITY' },
      headers,
    );
    expect(saved.body).toEqual({ mode: 'CITY' });
    expect(prisma.searchPreference.upsert).toHaveBeenCalled();
  });

  it('searches and returns map points', async () => {
    const app = createApp(ready(true));
    const headers = await auth();
    prisma.$queryRaw.mockResolvedValue([]);
    expect(
      (await send(app, 'POST', '/api/search/events', { text: 'jazz' }, headers))
        .body,
    ).toEqual({ items: [], nextCursor: null });
    expect(
      (await send(app, 'POST', '/api/search/events/map', {}, headers)).body,
    ).toEqual({ points: [], total: 0 });
  });

  it('returns validation and JSON errors', async () => {
    const app = createApp(ready(true));
    const headers = await auth();
    const invalid = await send(
      app,
      'POST',
      '/api/search/events',
      { limit: 500 },
      headers,
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
    const broken = await send(app, 'POST', '/api/search/events', '{', headers);
    expect(broken.body.code).toBe('INVALID_JSON');
  });

  it('hides unexpected errors', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prisma.searchPreference.findUnique.mockRejectedValue(new Error('secret'));
    const response = await send(
      createApp(ready(true)),
      'GET',
      '/api/search/preference',
      undefined,
      await auth(),
    );
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('secret');
  });

  it('validates route requests', async () => {
    const response = await send(
      createApp(ready(true)),
      'POST',
      '/api/search/route',
      { eventId: 'x' },
      await auth(),
    );
    expect(response.status).toBe(400);
  });
});

describe('SearchOutboxWorker', () => {
  class TestWorker extends SearchOutboxWorker {
    readonly sent: unknown[] = [];
    constructor() {
      super(['k:1']);
      (this as any).producer = {
        send: async (input: unknown) => this.sent.push(input),
      };
    }
    load() {
      return this.loadPending();
    }
    publish(record: never) {
      return this.publishEvent(record);
    }
  }

  it('loads unpublished events in order', async () => {
    await new TestWorker().load();
    expect(prisma.outboxEvent.findMany).toHaveBeenCalledWith({
      where: { publishedAt: null },
      orderBy: { position: 'asc' },
      take: 100,
    });
  });

  it('publishes search telemetry and marks it sent', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const worker = new TestWorker();
    const id = randomUUID();
    await worker.publish({
      id,
      eventType: EVENT_TYPES.searchPerformed,
      occurredAt: new Date(),
      payload: {
        hasText: true,
        hasCategory: false,
        hasLocation: false,
        resultCount: 1,
      },
    } as never);
    expect(worker.sent[0]).toMatchObject({ topic: EVENT_TOPICS.search });
    expect(prisma.outboxEvent.update).toHaveBeenLastCalledWith({
      where: { id },
      data: { publishedAt: expect.any(Date) },
    });
  });

  it('refuses unknown event types', async () => {
    await expect(
      new TestWorker().publish({ id: randomUUID(), eventType: 'x' } as never),
    ).rejects.toThrow('Unsupported search event: x');
  });
});

describe('ServiceRequestHandler', () => {
  const request = (operation: string) =>
    ({ operation, sender: 'auth', data: {} }) as never;

  it('answers readiness and rejects unknown queries', async () => {
    const handler = new ServiceRequestHandler();
    expect(await handler.handle(request(RPC_OPERATIONS.readiness))).toEqual({
      status: 'ok',
      service: 'geo-search',
    });
    await expect(
      handler.handle(request(RPC_OPERATIONS.profile)),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});

describe('SearchPrivacyHandler', () => {
  it('erases preferences and anonymizes organizers', async () => {
    const query = vi.fn();
    const handler = new SearchPrivacyHandler(privacyDatabase as never);
    const work = {
      requestId: randomUUID(),
      userId: randomUUID(),
      eventIds: [],
      removedEventIds: [randomUUID()],
      mailRequestIds: [],
    };
    expect(await (handler as any).erase({ query }, work)).toEqual({});
    expect(query).toHaveBeenCalledWith(
      'DELETE FROM search_preference WHERE "userId" = $1',
      [work.userId],
    );
    expect(query.mock.calls[1]![1]).toEqual([work.userId, ANONYMOUS_USER_ID]);
    expect(query.mock.calls[2]![1]).toEqual([work.removedEventIds]);
  });
});
