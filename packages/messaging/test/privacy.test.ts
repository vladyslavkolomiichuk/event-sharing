import { randomUUID } from 'node:crypto';
import {
  ANONYMOUS_USER_ID,
  EVENT_TYPES,
  RPC_OPERATIONS,
  type EventEnvelope,
  type PrivacyWork,
  type RpcRequest,
} from '@event-sharing/contracts';
import type { PoolClient } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePg } from './fake-pg.js';

const pg = vi.hoisted(() => ({ current: undefined as never }));
vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return (pg.current as { pool: unknown }).pool;
  }),
}));

const {
  PRIVACY_LOCK,
  PrivacyDatabase,
  PrivacyEventGuard,
  ServicePrivacyHandler,
  ServiceRequestAuthenticator,
  privacyRequestGuard,
} = await import('../src/index.js');

const KEY = 'ef'.repeat(32);
let fake: ReturnType<typeof createFakePg>;
beforeEach(() => {
  fake = createFakePg();
  pg.current = fake as never;
});

const event = (
  payload: Record<string, unknown>,
  extra = {},
): EventEnvelope => ({
  eventId: randomUUID(),
  eventType: EVENT_TYPES.userJoined,
  eventVersion: 1,
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
  producer: 'participation',
  payload,
  ...extra,
});

describe('PrivacyEventGuard', () => {
  it('applies clean events inside the shared lock', async () => {
    const guard = new PrivacyEventGuard('postgres://x');
    const apply = vi.fn(async () => 'applied');
    const input = event({ userId: randomUUID(), eventId: randomUUID() });
    await expect(guard.run(input, apply)).resolves.toBe('applied');
    expect(apply).toHaveBeenCalledWith(input);
    expect(fake.sql()[0]).toContain('pg_advisory_lock_shared');
    expect(fake.sql().at(-1)).toContain('pg_advisory_unlock_shared');
    expect(fake.client.release).toHaveBeenCalled();
  });

  it('ignores redacted events', async () => {
    const guard = new PrivacyEventGuard('postgres://x');
    const apply = vi.fn();
    expect(await guard.run(event({}, { redacted: true }), apply)).toBe(
      'ignored',
    );
    expect(apply).not.toHaveBeenCalled();
  });

  it('drops events about deleted users and records a receipt', async () => {
    const userId = randomUUID();
    fake.state.respond = (sql) =>
      sql.includes('privacy_deleted_user') ? { rows: [{ userId }] } : undefined;
    const guard = new PrivacyEventGuard('postgres://x');
    const apply = vi.fn();
    expect(await guard.run(event({ userId }), apply)).toBe('ignored');
    expect(apply).not.toHaveBeenCalled();
    expect(
      fake.sql().some((sql) => sql.includes('INSERT INTO inbox_event')),
    ).toBe(true);
  });

  it('drops events about deleted events and erased mail', async () => {
    fake.state.respond = (sql) =>
      sql.includes('privacy_deleted_event') ||
      sql.includes('privacy_deleted_mail')
        ? { rowCount: 1 }
        : undefined;
    const guard = new PrivacyEventGuard('postgres://x');
    expect(await guard.run(event({ eventId: randomUUID() }), vi.fn())).toBe(
      'ignored',
    );
    const mail = event(
      {},
      { eventType: EVENT_TYPES.notificationRequested, producer: 'auth' },
    );
    expect(await guard.run(mail, vi.fn())).toBe('ignored');
  });

  it('anonymizes a deleted organizer and filters participants', async () => {
    const organizerId = randomUUID();
    const kept = randomUUID();
    fake.state.respond = (sql) =>
      sql.includes('privacy_deleted_user')
        ? { rows: [{ userId: organizerId }] }
        : undefined;
    const guard = new PrivacyEventGuard('postgres://x');
    const apply = vi.fn(async (input: EventEnvelope) => input.payload);
    const result = await guard.run(
      event(
        {
          organizerId,
          completedParticipantIds: [organizerId, kept, ANONYMOUS_USER_ID],
        },
        {
          eventType: EVENT_TYPES.registrationPolicyRequested,
          producer: 'events',
        },
      ),
      apply,
    );
    expect(result).toEqual({
      organizerId: ANONYMOUS_USER_ID,
      status: 'CLOSED',
      completedParticipantIds: [kept],
    });
  });

  it('runs recovery work under the lock', async () => {
    const guard = new PrivacyEventGuard('postgres://x');
    const work = vi.fn(async () => {});
    await guard.recover(work);
    expect(work).toHaveBeenCalled();
    expect(fake.sql()).toHaveLength(2);
    await guard.close();
    expect(fake.pool.end).toHaveBeenCalled();
  });
});

describe('PrivacyDatabase', () => {
  const work: PrivacyWork = {
    requestId: randomUUID(),
    userId: randomUUID(),
    eventIds: [],
    removedEventIds: [],
    mailRequestIds: [],
  };

  it('rejects commands that are not sealed strings', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    await expect(database.process('op', {}, vi.fn())).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('rejects a sealed command for another operation', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const input = database.cipher.encode({ operation: 'other', work });
    await expect(database.process('op', input, vi.fn())).rejects.toThrow(
      'Invalid privacy operation.',
    );
  });

  it('runs the handler once and stores a sealed receipt', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const input = database.cipher.encode({ operation: 'op', work });
    const handler = vi.fn(async () => ({ done: true }));
    const sealed = await database.process('op', input, handler);
    expect(database.cipher.decode(sealed)).toEqual({
      requestId: work.requestId,
      operation: 'op',
      result: { done: true },
    });
    expect(fake.query).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [PRIVACY_LOCK],
    );
    expect(fake.sql().at(-1)).toBe('COMMIT');
  });

  it('returns an existing receipt without running the handler', async () => {
    fake.state.respond = (sql) =>
      sql.includes('FROM privacy_receipt')
        ? { rows: [{ result: 'old' }] }
        : undefined;
    const database = new PrivacyDatabase('postgres://x', KEY);
    const input = database.cipher.encode({ operation: 'op', work });
    const handler = vi.fn();
    expect(await database.process('op', input, handler)).toBe('old');
    expect(handler).not.toHaveBeenCalled();
  });

  it('rolls back when the handler fails', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const input = database.cipher.encode({ operation: 'op', work });
    await expect(
      database.process('op', input, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(fake.sql()).toContain('ROLLBACK');
    expect(fake.client.release).toHaveBeenCalled();
  });

  it('deletes expired exports on cleanup', async () => {
    vi.useFakeTimers();
    const database = new PrivacyDatabase('postgres://x', KEY);
    database.startCleanup();
    await vi.advanceTimersByTimeAsync(0);
    expect(fake.sql()[0]).toContain('DELETE FROM privacy_export_snapshot');
    await database.close();
    vi.useRealTimers();
  });
});

describe('ServicePrivacyHandler', () => {
  class TestHandler extends ServicePrivacyHandler {
    protected readonly collections = [
      { name: 'items', query: 'SELECT * FROM item WHERE "userId" = $1' },
    ];
    erased = vi.fn(async () => ({ erased: true }));
    protected erase(tx: PoolClient, work: PrivacyWork) {
      return this.erased(tx, work);
    }
  }

  const request = (
    operation: RpcRequest['operation'],
    data: unknown,
  ): RpcRequest => ({
    kind: 'request',
    id: randomUUID(),
    sender: 'auth',
    target: 'events',
    operation,
    deadline: Date.now() + 1000,
    data,
  });

  it('accepts commands only from Auth', async () => {
    const handler = new TestHandler(new PrivacyDatabase('postgres://x', KEY));
    await expect(
      handler.handle({
        ...request(RPC_OPERATIONS.privacyErase, ''),
        sender: 'users',
      }),
    ).rejects.toThrow('Privacy commands require Auth.');
  });

  it('erases a user and scrubs every queue table', async () => {
    fake.state.respond = (sql) =>
      sql.includes('information_schema.tables')
        ? {
            rows: [
              'ordered_delivery',
              'outbox_stream_head',
              'outbox_event',
              'pending_snapshot_event',
              'pending_membership_event',
            ].map((table_name) => ({ table_name })),
          }
        : undefined;
    const database = new PrivacyDatabase('postgres://x', KEY);
    const handler = new TestHandler(database);
    const work = {
      requestId: randomUUID(),
      userId: randomUUID(),
      eventIds: [],
      removedEventIds: [randomUUID()],
      mailRequestIds: [randomUUID()],
    };
    const sealed = await handler.handle(
      request(
        RPC_OPERATIONS.privacyErase,
        database.cipher.encode({
          operation: RPC_OPERATIONS.privacyErase,
          work,
        }),
      ),
    );
    expect(database.cipher.decode(sealed as string)).toMatchObject({
      result: { erased: true },
    });
    const statements = fake.sql().join('\n');
    for (const table of [
      'privacy_deleted_user',
      'privacy_deleted_mail',
      'privacy_deleted_event',
      'UPDATE ordered_delivery',
      'pending_membership_event',
      'pending_snapshot_event',
      'DELETE FROM outbox_event',
    ]) {
      expect(statements).toContain(table);
    }
  });

  it('rejects reservations it does not support', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const handler = new TestHandler(database);
    const work = { requestId: randomUUID(), userId: randomUUID() };
    await expect(
      handler.handle(
        request(
          RPC_OPERATIONS.privacyReserve,
          database.cipher.encode({
            operation: RPC_OPERATIONS.privacyReserve,
            work,
          }),
        ),
      ),
    ).rejects.toThrow('Unsupported reservation.');
  });

  it('builds an export snapshot and returns the requested page', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const handler = new TestHandler(database);
    const page = {
      requestId: randomUUID(),
      userId: randomUUID(),
      expiresAt: Date.now() + 60000,
      collection: 0,
      offset: 0,
    };
    let stored = '';
    fake.state.respond = (sql, params) => {
      if (sql.startsWith('SELECT * FROM item')) return { rows: [{ id: 1 }] };
      if (sql.startsWith('INSERT INTO privacy_export_snapshot'))
        stored = params[4] as string;
      if (sql.startsWith('SELECT data FROM'))
        return { rows: [{ data: stored }] };
      return undefined;
    };
    const result = await handler.handle(
      request(RPC_OPERATIONS.privacyExport, database.cipher.encode(page)),
    );
    expect(database.cipher.decode(result as string)).toEqual({
      collection: 'items',
      rows: [{ id: 1 }],
      next: null,
    });
  });

  it('refuses expired exports and deleted accounts', async () => {
    const database = new PrivacyDatabase('postgres://x', KEY);
    const handler = new TestHandler(database);
    const page = { requestId: randomUUID(), userId: randomUUID() };
    await expect(
      handler.handle(
        request(
          RPC_OPERATIONS.privacyExport,
          database.cipher.encode({ ...page, expiresAt: 1 }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'EXPORT_EXPIRED' });
    fake.state.respond = (sql) =>
      sql.includes('privacy_deleted_user') ? { rowCount: 1 } : undefined;
    await expect(
      handler.handle(
        request(
          RPC_OPERATIONS.privacyExport,
          database.cipher.encode({ ...page, expiresAt: Date.now() + 1000 }),
        ),
      ),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETED' });
    expect(fake.sql()).toContain('ROLLBACK');
  });
});

describe('request guards', () => {
  const verifier = (claims: unknown) => ({ verify: vi.fn(async () => claims) });

  it('returns the authenticated user', async () => {
    const id = randomUUID();
    const authenticator = new ServiceRequestAuthenticator(
      verifier({ sub: id, role: 'ADMIN' }) as never,
      fake.pool as never,
    );
    expect(await authenticator.user({} as RpcRequest)).toEqual({
      id,
      role: 'ADMIN',
    });
  });

  it('rejects missing tokens and deleted accounts', async () => {
    await expect(
      new ServiceRequestAuthenticator(
        verifier(null) as never,
        fake.pool as never,
      ).user({} as RpcRequest),
    ).rejects.toMatchObject({ statusCode: 401 });
    fake.state.respond = () => ({ rowCount: 1 });
    await expect(
      new ServiceRequestAuthenticator(
        verifier({ sub: randomUUID(), role: 'USER' }) as never,
        fake.pool as never,
      ).user({} as RpcRequest),
    ).rejects.toMatchObject({ statusCode: 410 });
  });

  it('lets active users through the request guard', async () => {
    const next = vi.fn();
    await privacyRequestGuard(fake.pool as never)(
      randomUUID(),
      {} as never,
      next,
    );
    expect(next).toHaveBeenCalledWith();
    fake.state.respond = () => ({ rowCount: 1 });
    await expect(
      privacyRequestGuard(fake.pool as never)(randomUUID(), {} as never, next),
    ).rejects.toMatchObject({ code: 'ACCOUNT_DELETED' });
  });
});
