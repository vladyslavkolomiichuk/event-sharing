import { createHash, randomUUID } from 'node:crypto';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import { EventCodec, ServiceMessageCipher } from '@event-sharing/messaging';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeProducer, kafka } from '../../../test/fake-kafka.js';
import { send } from '../../../test/helpers.js';
import { prisma, privacyDatabase, serviceBus } from './mocks.js';

const session = vi.hoisted(() => ({
  current: null as null | { user: { id: string; role: string } },
  token: 'internal.jwt' as string | null,
}));
vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('@event-sharing/messaging', async (original) =>
  (await import('../../../test/fake-kafka.js')).mockMessaging(await original()),
);
vi.mock('better-auth/node', () => ({
  toNodeHandler: () => (_request: unknown, response: any) => {
    response.statusCode = 200;
    response.end('better-auth');
  },
}));
vi.mock('../src/lib/auth.js', () => ({
  accountMailAvailable: false,
  socialProvidersAvailable: { google: false, github: true },
  auth: {
    api: {
      getJwks: vi.fn(async () => ({ keys: [] })),
      getSession: vi.fn(
        async ({ returnHeaders }: { returnHeaders?: boolean }) => {
          const headers = new Headers(
            session.token ? { 'set-auth-jwt': session.token } : {},
          );
          return returnHeaders
            ? { response: session.current, headers }
            : session.current;
        },
      ),
    },
  },
}));

const { createApp } = await import('../src/app.js');
const { ServiceRequestHandler } =
  await import('../src/services/ServiceRequestHandler.js');
const { AuthPrivacyHandler } =
  await import('../src/privacy/AuthPrivacyHandler.js');
const { IdentityOutboxWorker } =
  await import('../src/workers/IdentityOutboxWorker.js');
const { AuthMailOutboxWorker } =
  await import('../src/workers/AuthMailOutboxWorker.js');
const { PrivacyExportWorker } =
  await import('../src/workers/PrivacyExportWorker.js');

const app = () => createApp({ check: async () => true });
const cookie = { cookie: 'better-auth.session_token=x' };
const login = (role = 'USER', id = randomUUID()) => {
  session.current = { user: { id, role } };
  return id;
};
const pgClient = {
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
  release: vi.fn(),
};

beforeEach(() => {
  prisma.reset();
  kafka.reset();
  session.current = null;
  session.token = 'internal.jwt';
  vi.spyOn(console, 'info').mockImplementation(() => {});
  privacyDatabase.pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
  (privacyDatabase.pool as any).connect = vi.fn(async () => pgClient);
  pgClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('public endpoints', () => {
  it('serve health, capabilities and username checks', async () => {
    expect((await send(app(), 'GET', '/health')).body.service).toBe('Auth');
    expect(
      (await send(createApp({ check: async () => false }), 'GET', '/ready'))
        .status,
    ).toBe(503);
    expect(
      (await send(app(), 'GET', '/backend/auth/account-capabilities')).body,
    ).toEqual({
      emailDeliveryAvailable: false,
      socialProviders: { google: false, github: true },
    });
    prisma.user.findUnique.mockResolvedValue(null);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/username-availability?username=iryna',
        )
      ).body,
    ).toEqual({ available: true });
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/username-availability?username=admin',
        )
      ).status,
    ).toBe(400);
    prisma.user.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/username-suggestions?name=Olena',
        )
      ).body.suggestions,
    ).toEqual(['olena_1', 'olena1']);
  });

  it('pass other auth paths to Better Auth', async () => {
    const response = await send(
      app(),
      'POST',
      '/backend/auth/sign-in/email',
      {},
    );
    expect(response.body).toBe('better-auth');
  });

  it('report deletion status by receipt', async () => {
    const receipt = 'a'.repeat(43);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/privacy/deletion-status',
          undefined,
          {
            'x-privacy-receipt': receipt,
          },
        )
      ).status,
    ).toBe(404);
    prisma.privacyDeletionJob.findUnique.mockResolvedValue({
      errorCode: null,
      completedAt: null,
      frozenAt: new Date(),
      createdAt: new Date(),
      steps: [{ completedAt: new Date() }, { completedAt: null }],
    });
    const status = await send(
      app(),
      'GET',
      '/backend/auth/privacy/deletion-status',
      undefined,
      {
        'x-privacy-receipt': receipt,
      },
    );
    expect(status.body).toMatchObject({
      status: 'PROCESSING',
      progress: { completed: 1, total: 2 },
    });
    expect(
      prisma.privacyDeletionJob.findUnique.mock.calls.at(-1)![0].where
        .receiptHash,
    ).toBe(createHash('sha256').update(receipt).digest('hex'));
  });
});

describe('session endpoints', () => {
  it('require a session cookie', async () => {
    expect(
      (await send(app(), 'GET', '/backend/auth/organizer-requests/me')).status,
    ).toBe(401);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/organizer-requests/me',
          undefined,
          cookie,
        )
      ).status,
    ).toBe(401);
  });

  it('reject untrusted origins on writes', async () => {
    login();
    const response = await send(
      app(),
      'PATCH',
      '/backend/auth/identity',
      { name: 'Iryna' },
      {
        ...cookie,
        origin: 'https://evil.test',
      },
    );
    expect(response.status).toBe(403);
  });

  it('update identity and list social accounts', async () => {
    const id = login();
    prisma.user.update.mockResolvedValue({
      id,
      name: 'Iryna',
      username: 'iryna',
    });
    expect(
      (
        await send(
          app(),
          'PATCH',
          '/backend/auth/identity',
          { name: 'Iryna' },
          {
            ...cookie,
            origin: 'http://app.test',
          },
        )
      ).body.name,
    ).toBe('Iryna');
    prisma.account.findMany.mockResolvedValue([{ providerId: 'github' }]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/social-accounts',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({
      providers: ['github'],
    });
  });

  it('create and read organizer requests', async () => {
    login();
    prisma.organizerRequest.findFirst.mockResolvedValue(null);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/organizer-requests/me',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({ request: null });
    expect(
      (
        await send(
          app(),
          'POST',
          '/backend/auth/organizer-requests',
          { reason: '' },
          cookie,
        )
      ).status,
    ).toBe(400);
  });

  it('let only admins manage requests and roles', async () => {
    login('USER');
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/admin/organizer-requests',
          undefined,
          cookie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/admin/privacy-requests',
          undefined,
          cookie,
        )
      ).status,
    ).toBe(403);
    const adminId = login('ADMIN');
    prisma.organizerRequest.findMany.mockResolvedValue([]);
    prisma.organizerRequest.count.mockResolvedValue(0);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/admin/organizer-requests',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({ requests: [], total: 0 });
    prisma.user.findUnique.mockResolvedValue({ id: adminId });
    expect(
      (
        await send(
          app(),
          'PATCH',
          '/backend/auth/admin/users/me_admin/role',
          { role: 'USER' },
          cookie,
        )
      ).status,
    ).toBe(409);
    prisma.privacyRequest.findMany.mockResolvedValue([]);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/admin/privacy-requests',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({ requests: [] });
  });

  it('request deletion only without active events', async () => {
    login();
    serviceBus.call.mockResolvedValueOnce({ hasActiveEvents: true });
    expect(
      (
        await send(
          app(),
          'POST',
          '/backend/auth/privacy/deletion-request',
          {},
          cookie,
        )
      ).status,
    ).toBe(409);
    serviceBus.call.mockResolvedValueOnce({ hasActiveEvents: false });
    prisma.privacyRequest.createMany.mockResolvedValue({ count: 1 });
    prisma.privacyRequest.findFirstOrThrow.mockResolvedValue({
      id: randomUUID(),
      status: 'PENDING',
      requestedAt: new Date(),
    });
    const accepted = await send(
      app(),
      'POST',
      '/backend/auth/privacy/deletion-request',
      {},
      cookie,
    );
    expect(accepted.status).toBe(202);
    expect(accepted.body.receipt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    prisma.privacyRequest.findFirst.mockResolvedValue(null);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/privacy/deletion-request',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({ status: 'NONE' });
  });

  it('create, report and download personal data exports', async () => {
    const userId = login();
    const created = await send(
      app(),
      'POST',
      '/backend/auth/privacy/exports',
      {},
      cookie,
    );
    expect(created.status).toBe(202);
    const inserts = pgClient.query.mock.calls.filter((call) =>
      String(call[0]).startsWith('INSERT INTO privacy_export_source'),
    );
    expect(inserts).toHaveLength(9);
    expect(
      (
        await send(
          app(),
          'GET',
          '/backend/auth/privacy/exports',
          undefined,
          cookie,
        )
      ).body,
    ).toEqual({
      status: 'NONE',
    });
    const id = randomUUID();
    expect(
      (
        await send(
          app(),
          'GET',
          `/backend/auth/privacy/exports/${id}/file`,
          undefined,
          cookie,
        )
      ).status,
    ).toBe(404);
    const cipher = new ServiceMessageCipher('22'.repeat(32));
    privacyDatabase.pool.query
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [{ createdAt: 'c', completedAt: 'd' }],
      })
      .mockResolvedValueOnce({
        rowCount: 1,
        rows: [
          {
            service: 'users',
            data: cipher.encode({
              collection: 'profile',
              rows: [{ a: 1 }],
              next: null,
            }),
          },
        ],
      });
    const file = await send(
      app(),
      'GET',
      `/backend/auth/privacy/exports/${id}/file`,
      undefined,
      cookie,
    );
    expect(file.body).toMatchObject({
      userId,
      complete: true,
      data: { users: { profile: [{ a: 1 }] } },
    });
    expect(file.headers.get('content-disposition')).toContain(
      'event-sharing-data.json',
    );
  });
});

describe('ServiceRequestHandler', () => {
  const rpc = (operation: string, sender = 'gateway', data: unknown = {}) =>
    ({ operation, sender, data }) as never;

  it('answers readiness, signing keys and gateway sessions', async () => {
    const handler = new ServiceRequestHandler();
    expect(await handler.handle(rpc(RPC_OPERATIONS.readiness))).toEqual({
      status: 'ok',
      service: 'Auth',
    });
    expect(await handler.handle(rpc(RPC_OPERATIONS.signingKeys))).toEqual({
      keys: [],
    });
    expect(
      await handler.handle(
        rpc(RPC_OPERATIONS.session, 'gateway', { cookie: 'c' }),
      ),
    ).toBeNull();
    login();
    expect(
      await handler.handle(
        rpc(RPC_OPERATIONS.session, 'gateway', { cookie: 'c' }),
      ),
    ).toMatchObject({
      token: 'internal.jwt',
    });
    session.token = null;
    await expect(
      handler.handle(rpc(RPC_OPERATIONS.session, 'gateway', { cookie: 'c' })),
    ).rejects.toThrow('Session token is unavailable.');
    await expect(
      handler.handle(rpc(RPC_OPERATIONS.session, 'users', { cookie: 'c' })),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('refuses direct erasure of Auth data', async () => {
    await expect(
      (new AuthPrivacyHandler(privacyDatabase as never) as any).erase(),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('outbox workers', () => {
  it('publishes identity events with ordering and redaction', async () => {
    const worker = new IdentityOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    await worker.loadPending();
    expect(
      prisma.outboxEvent.findMany.mock.calls[0]![0].where.eventType.in,
    ).toHaveLength(6);
    const userId = randomUUID();
    const base = {
      aggregateId: userId,
      occurredAt: new Date(),
      ordered: true,
      previousEventId: null,
    };
    await worker.publishEvent({
      ...base,
      id: randomUUID(),
      eventType: EVENT_TYPES.userRegistered,
      payload: { userId, role: 'USER' },
      redacted: false,
    });
    await worker.publishEvent({
      ...base,
      id: randomUUID(),
      eventType: EVENT_TYPES.userNameUpdated,
      payload: { secret: 1 },
      redacted: true,
    });
    const [first, second] = kafka.sent.map((entry) =>
      EventCodec.decode(entry.messages[0]!.value),
    );
    expect(first!.delivery).toEqual({
      stream: `auth:${userId}`,
      previousEventId: null,
    });
    expect(second!.payload).toEqual({});
    await expect(
      worker.publishEvent({
        ...base,
        id: randomUUID(),
        eventType: 'x',
        redacted: false,
      }),
    ).rejects.toThrow('Unsupported identity event type: x');
  });

  it('publishes encrypted mail requests', async () => {
    const worker = new AuthMailOutboxWorker(['k:1']) as any;
    worker.producer = fakeProducer;
    await worker.publishEvent({
      id: randomUUID(),
      aggregateId: randomUUID(),
      eventType: EVENT_TYPES.notificationRequested,
      occurredAt: new Date(),
      payload: {
        iv: 'a',
        tag: 'b',
        ciphertext: 'c',
        expiresAt: new Date().toISOString(),
      },
    });
    expect(kafka.sent[0]!.topic).toBe(EVENT_TOPICS.notifications);
  });
});

describe('PrivacyExportWorker', () => {
  it('collects pages and marks finished sources', async () => {
    const worker = new PrivacyExportWorker() as any;
    worker.lock = {
      run: async (work: () => Promise<void>) => work(),
      close: vi.fn(),
    };
    const cipher = new ServiceMessageCipher('22'.repeat(32));
    const source = {
      jobId: randomUUID(),
      userId: randomUUID(),
      service: 'users',
      collection: 0,
      offset: 0,
      expiresAt: new Date(Date.now() + 60000),
    };
    privacyDatabase.pool.query.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT source.*')
        ? { rows: [source], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    );
    serviceBus.call.mockResolvedValueOnce(
      cipher.encode({ collection: 'profile', rows: [], next: null }),
    );
    await worker.runOnce();
    const update = pgClient.query.mock.calls.find((call) =>
      String(call[0]).startsWith('UPDATE privacy_export_source'),
    )!;
    expect(update[1][4]).toBeInstanceOf(Date);
    serviceBus.call.mockResolvedValueOnce(42);
    await worker.runOnce();
    expect(
      privacyDatabase.pool.query.mock.calls.some((call: any[]) =>
        String(call[0]).includes('attempts + 1'),
      ),
    ).toBe(true);
  });
});
