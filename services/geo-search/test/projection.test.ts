import { randomUUID } from 'node:crypto';
import { EVENT_TOPICS, EVENT_TYPES } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, eventDetail } from '../../../test/fixtures.js';
import { prisma } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { SearchProjectionRepository } =
  await import('../src/repositories/SearchProjectionRepository.js');

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
const created = (payload: unknown) =>
  envelope(EVENT_TYPES.eventCreated, 'events', payload);

beforeEach(() => {
  prisma.reset();
  prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
  prisma.pendingSnapshotEvent.findMany.mockResolvedValue([]);
});

describe('SearchProjectionRepository.apply', () => {
  it('ignores foreign producers and other event types', async () => {
    const repository = new SearchProjectionRepository();
    expect(
      await repository.apply(
        envelope(EVENT_TYPES.userJoined, 'participation', {}),
      ),
    ).toBe('ignored');
  });

  it('stores public coordinates and venue for public events', async () => {
    const payload = snapshot();
    expect(await new SearchProjectionRepository().apply(created(payload))).toBe(
      'processed',
    );
    const { create } = prisma.eventProjection.upsert.mock.calls[0]![0];
    expect(create).toMatchObject({
      id: payload.id,
      address: 'Khreshchatyk 1',
      latitude: 50.45,
      eventVisibility: 'PUBLIC',
      region: 'Kyiv',
    });
  });

  it('hides the address of private venues and all coordinates of private events', async () => {
    const repository = new SearchProjectionRepository();
    const privateVenue = snapshot({
      location: {
        region: 'Kyiv',
        visibility: 'PARTICIPANTS_ONLY',
        address: 'Secret 1',
        latitude: 50.4,
        longitude: 30.5,
      },
    });
    await repository.apply(created(privateVenue));
    expect(
      prisma.eventProjection.upsert.mock.calls[0]![0].create,
    ).toMatchObject({
      address: null,
      latitude: 50.4,
    });
    await repository.apply(created(snapshot({ visibility: 'INVITE_ONLY' })));
    expect(
      prisma.eventProjection.upsert.mock.calls[1]![0].create,
    ).toMatchObject({
      address: null,
      latitude: null,
      longitude: null,
    });
  });

  it('reports duplicates and stale versions', async () => {
    const repository = new SearchProjectionRepository();
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(await repository.apply(created(snapshot()))).toBe('duplicate');
    prisma.eventProjection.findUnique.mockResolvedValueOnce({ version: 5 });
    expect(await repository.apply(created(snapshot({ version: 3 })))).toBe(
      'ignored',
    );
    expect(prisma.eventProjection.upsert).not.toHaveBeenCalled();
  });

  it('parks a snapshot until its predecessor arrives', async () => {
    const previousSnapshotEventId = randomUUID();
    const event = created({ ...snapshot(), previousSnapshotEventId });
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    expect(await new SearchProjectionRepository().apply(event)).toBe('pending');
    expect(prisma.pendingSnapshotEvent.createMany).toHaveBeenCalledWith({
      data: {
        id: event.eventId,
        previousEventId: previousSnapshotEventId,
        envelope: JSON.stringify(event),
      },
      skipDuplicates: true,
    });
  });

  it('drains parked successors after applying', async () => {
    const first = created(snapshot());
    const next = created({
      ...snapshot(),
      previousSnapshotEventId: first.eventId,
    });
    prisma.inboxEvent.findUnique.mockResolvedValue({ id: first.eventId });
    prisma.pendingSnapshotEvent.findMany.mockResolvedValueOnce([
      { envelope: JSON.stringify(next) },
    ]);
    await new SearchProjectionRepository().apply(first);
    expect(prisma.eventProjection.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.pendingSnapshotEvent.deleteMany).toHaveBeenCalledWith({
      where: { id: next.eventId },
    });
  });

  it('recovers parked snapshots whose predecessor is known', async () => {
    const event = created(snapshot());
    prisma.$queryRaw.mockResolvedValueOnce([
      { envelope: JSON.stringify(event) },
    ]);
    await new SearchProjectionRepository().recoverPending();
    expect(prisma.eventProjection.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('EventProjectionConsumer', () => {
  it('decodes, guards and applies each message', async () => {
    const consumer = {
      events: { CRASH: 'crash' },
      on: vi.fn(),
      connect: vi.fn(),
      subscribe: vi.fn(),
      run: vi.fn(),
      disconnect: vi.fn(),
    };
    const guard = {
      run: vi.fn(async (event, apply) => apply(event)),
      recover: vi.fn(async (work) => work()),
      close: vi.fn(),
    };
    vi.doMock('@event-sharing/messaging', async (original) => ({
      ...(await original<object>()),
      KafkaClientFactory: vi.fn(function Factory() {
        return { createConsumer: () => consumer };
      }),
      PrivacyEventGuard: vi.fn(function Guard() {
        return guard;
      }),
    }));
    vi.resetModules();
    const { EventProjectionConsumer } =
      await import('../src/consumers/EventProjectionConsumer.js');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const repository = {
      apply: vi.fn(async () => 'processed'),
      recoverPending: vi.fn(),
    };
    const projection = new EventProjectionConsumer(
      ['k:1'],
      repository as never,
    );
    await projection.start();
    await vi.waitFor(() => expect(consumer.run).toHaveBeenCalled());
    expect(consumer.subscribe).toHaveBeenCalledWith({
      topic: EVENT_TOPICS.events,
      fromBeginning: true,
    });
    const event = created(snapshot());
    const { EventCodec } = await import('@event-sharing/messaging');
    await consumer.run.mock.calls[0]![0].eachMessage({
      topic: EVENT_TOPICS.events,
      message: { value: Buffer.from(EventCodec.encode(event)) },
    });
    expect(repository.apply).toHaveBeenCalledWith(event);
    await vi.waitFor(() =>
      expect(repository.recoverPending).toHaveBeenCalled(),
    );
    await projection.stop();
    expect(consumer.disconnect).toHaveBeenCalled();
    expect(guard.close).toHaveBeenCalled();
    vi.doUnmock('@event-sharing/messaging');
  });
});
