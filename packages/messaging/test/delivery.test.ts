import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { EVENT_TYPES, type EventEnvelope } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakePg } from './fake-pg.js';

const pg = vi.hoisted(() => ({ current: undefined as never }));
vi.mock('pg', () => ({
  Pool: vi.fn(function Pool() {
    return (pg.current as { pool: unknown }).pool;
  }),
}));
const producer = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  disconnect: vi.fn(async () => {}),
  send: vi.fn(async () => {}),
}));
vi.mock('kafkajs', () => ({
  Kafka: vi.fn(function Kafka() {
    return { producer: () => producer, consumer: vi.fn() };
  }),
  Partitioners: { DefaultPartitioner: vi.fn() },
  logLevel: { WARN: 4 },
}));

const {
  AbstractOutboxWorker,
  OrderedEventProcessor,
  PostgresOutboxLock,
  UserRealtimeHub,
} = await import('../src/index.js');

let fake: ReturnType<typeof createFakePg>;
beforeEach(() => {
  fake = createFakePg();
  pg.current = fake as never;
  vi.clearAllMocks();
});

const envelope = (delivery?: EventEnvelope['delivery']): EventEnvelope => ({
  eventId: randomUUID(),
  eventType: EVENT_TYPES.eventCreated,
  eventVersion: 1,
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
  producer: 'events',
  payload: {},
  ...(delivery ? { delivery } : {}),
});

describe('OrderedEventProcessor', () => {
  it('applies unordered events directly', async () => {
    const apply = vi.fn(async () => 'applied');
    const processor = new OrderedEventProcessor('postgres://x', apply);
    expect(await processor.run(envelope())).toBe('applied');
    expect(fake.query).not.toHaveBeenCalled();
  });

  it('stores ordered events and drains ready ones', async () => {
    const first = envelope({ stream: 's1', previousEventId: null });
    const pending = [JSON.stringify(first)];
    fake.state.respond = (sql) => {
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ locked: true }] };
      if (sql.includes('SELECT item.id')) {
        const next = pending.shift();
        return { rows: next ? [{ id: first.eventId, envelope: next }] : [] };
      }
      return undefined;
    };
    const apply = vi.fn(async () => 'applied');
    await new OrderedEventProcessor('postgres://x', apply).run(first);
    expect(apply).toHaveBeenCalledWith(first);
    const statements = fake.sql();
    expect(statements[0]).toContain('INSERT INTO ordered_delivery');
    expect(
      statements.some((sql) => sql.includes('SET "processedAt" = now()')),
    ).toBe(true);
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
  });

  it('stops draining when the handler reports pending', async () => {
    const event = envelope({ stream: 's1', previousEventId: null });
    fake.state.respond = (sql) => {
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ locked: true }] };
      if (sql.includes('SELECT item.id'))
        return {
          rows: [{ id: event.eventId, envelope: JSON.stringify(event) }],
        };
      return undefined;
    };
    const apply = vi.fn(async () => 'pending');
    await new OrderedEventProcessor('postgres://x', apply).run(event);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(fake.sql().some((sql) => sql.includes('SET "processedAt"'))).toBe(
      false,
    );
  });

  it('skips draining when another worker holds the stream', async () => {
    fake.state.respond = (sql) =>
      sql.includes('pg_try_advisory_lock')
        ? { rows: [{ locked: false }] }
        : undefined;
    const apply = vi.fn();
    await new OrderedEventProcessor('postgres://x', apply).run(
      envelope({ stream: 's1', previousEventId: null }),
    );
    expect(apply).not.toHaveBeenCalled();
    expect(fake.sql().some((sql) => sql.includes('pg_advisory_unlock'))).toBe(
      false,
    );
  });

  it('recovers every pending stream', async () => {
    const streams = [[{ stream: 'a' }, { stream: 'b' }], []];
    fake.state.respond = (sql) => {
      if (sql.includes('SELECT DISTINCT stream'))
        return { rows: streams.shift() };
      if (sql.includes('pg_try_advisory_lock'))
        return { rows: [{ locked: false }] };
      return undefined;
    };
    await new OrderedEventProcessor('postgres://x', vi.fn()).recoverPending();
    const locks = fake.state.queries.filter((entry) =>
      entry.sql.includes('pg_try_advisory_lock'),
    );
    expect(locks.map((entry) => entry.params[0])).toEqual([
      'ordered:a',
      'ordered:b',
    ]);
  });
});

describe('PostgresOutboxLock', () => {
  it('runs work only when the lock is acquired', async () => {
    fake.state.respond = (sql) =>
      sql.includes('pg_try_advisory_xact_lock')
        ? { rows: [{ acquired: true }] }
        : undefined;
    const work = vi.fn(async () => {});
    await new PostgresOutboxLock('postgres://x', 'events').run(work);
    expect(work).toHaveBeenCalled();
    expect(fake.sql().at(-1)).toBe('COMMIT');

    fake.state.respond = () => ({ rows: [{ acquired: false }] });
    const skipped = vi.fn();
    await new PostgresOutboxLock('postgres://x', 'events').run(skipped);
    expect(skipped).not.toHaveBeenCalled();
  });

  it('rolls back failed work', async () => {
    fake.state.respond = () => ({ rows: [{ acquired: true }] });
    await expect(
      new PostgresOutboxLock('postgres://x', 'events').run(async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(fake.sql().at(-1)).toBe('ROLLBACK');
  });
});

describe('AbstractOutboxWorker', () => {
  class Worker extends AbstractOutboxWorker<string> {
    events = ['a', 'b'];
    published: string[] = [];
    constructor(lock = false) {
      super({
        clientId: 'test',
        brokers: ['kafka:9092'],
        ...(lock ? { databaseUrl: 'postgres://x', lockName: 'test' } : {}),
      });
    }
    protected async loadPending() {
      return this.events.splice(0);
    }
    protected async publishEvent(event: string) {
      this.published.push(event);
    }
  }

  it('connects once and publishes pending events', async () => {
    vi.useFakeTimers();
    const worker = new Worker();
    await worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.published).toEqual(['a', 'b']);
    worker.events.push('c');
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.published).toEqual(['a', 'b', 'c']);
    expect(producer.connect).toHaveBeenCalledTimes(1);
    await worker.stop();
    expect(producer.disconnect).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('publishes under the database lock when configured', async () => {
    fake.state.respond = () => ({ rows: [{ acquired: true }] });
    vi.useFakeTimers();
    const worker = new Worker(true);
    await worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(worker.published).toEqual(['a', 'b']);
    expect(fake.sql()).toContain('BEGIN');
    await worker.stop();
    expect(fake.pool.end).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('logs failed batches and keeps running', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    producer.connect.mockRejectedValueOnce(new Error('down'));
    vi.useFakeTimers();
    const worker = new Worker();
    await worker.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(error).toHaveBeenCalledWith(
      'Outbox delivery failed.',
      expect.any(Error),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(worker.published).toEqual(['a', 'b']);
    await worker.stop();
    vi.useRealTimers();
  });
});

describe('UserRealtimeHub', () => {
  class FakeSocket extends EventEmitter {
    readyState = 1;
    send = vi.fn();
    close = vi.fn(() => this.emit('close'));
    terminate = vi.fn();
  }
  const signal = { type: 'notifications.changed' } as never;

  it('publishes to the sockets of each user once', () => {
    const hub = new UserRealtimeHub();
    const first = new FakeSocket();
    const second = new FakeSocket();
    hub.add('u1', first as never, Date.now() + 60000);
    hub.add('u2', second as never, Date.now() + 60000);
    hub.publish(['u1', 'u1'], signal);
    expect(first.send).toHaveBeenCalledTimes(1);
    expect(second.send).not.toHaveBeenCalled();
    hub.broadcast(signal);
    expect(second.send).toHaveBeenCalledTimes(1);
    hub.close();
  });

  it('skips closed sockets and terminates failing ones', () => {
    const hub = new UserRealtimeHub();
    const closed = new FakeSocket();
    closed.readyState = 3;
    const failing = new FakeSocket();
    failing.send.mockImplementation(() => {
      throw new Error('broken');
    });
    hub.add('u1', closed as never, Date.now() + 60000);
    hub.add('u1', failing as never, Date.now() + 60000);
    hub.publish(['u1'], signal);
    expect(closed.send).not.toHaveBeenCalled();
    expect(failing.terminate).toHaveBeenCalled();
    hub.close();
  });

  it('closes sockets when the session expires and forgets them', () => {
    vi.useFakeTimers();
    const hub = new UserRealtimeHub();
    const socket = new FakeSocket();
    hub.add('u1', socket as never, Date.now() + 1000);
    vi.advanceTimersByTime(1000);
    expect(socket.close).toHaveBeenCalledWith(4001, 'Session expired');
    socket.send.mockClear();
    hub.publish(['u1'], signal);
    expect(socket.send).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
