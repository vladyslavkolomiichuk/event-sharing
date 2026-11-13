import { randomUUID } from 'node:crypto';
import { EVENT_TYPES, EventEnvelopeSchema } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope } from '../../../test/fixtures.js';
import { eventRow, prisma } from './rows.js';

vi.mock('../src/database/client.js', () => import('./rows.js'));

const { EventRepository } =
  await import('../src/repositories/EventRepository.js');
const { CategoryRepository } =
  await import('../src/repositories/CategoryRepository.js');
const { PublicEventRepository } =
  await import('../src/repositories/PublicEventRepository.js');
const { ParticipantAccessRepository } =
  await import('../src/repositories/ParticipantAccessRepository.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

const past = () => new Date(Date.now() - 3600000);
const future = (hours = 24) => new Date(Date.now() + hours * 3600000);

let stored: any;
const repository = () => new EventRepository();
const updates = () =>
  prisma.event.update.mock.calls.map((call: any[]) => call[0].data);
const outbox = () =>
  prisma.outboxEvent.create.mock.calls.map((call: any[]) => call[0].data);

beforeEach(() => {
  prisma.reset();
  stored = eventRow();
  prisma.event.findUnique.mockImplementation(async () => stored);
  prisma.event.update.mockImplementation(async ({ data }: any) => {
    const next = { ...stored };
    for (const [key, value] of Object.entries(data)) {
      if (
        value &&
        typeof value === 'object' &&
        'increment' in (value as object)
      )
        next[key] = stored[key] + 1;
      else if (!(
        value &&
        typeof value === 'object' &&
        !(value instanceof Date)
      ))
        next[key] = value;
    }
    return next;
  });
  prisma.outboxEvent.create.mockImplementation(async () => ({
    id: randomUUID(),
  }));
  prisma.participantAccess.findMany.mockResolvedValue([]);
});

describe('queries', () => {
  it('lists public events after a cursor', async () => {
    const cursor = {
      version: 1 as const,
      id: randomUUID(),
      createdAt: '2026-11-01T10:00:00.000Z',
      fingerprint: 'x',
    };
    await repository().listPublic(cursor, 'uncategorized', 10);
    const args = prisma.event.findMany.mock.calls[0]![0];
    expect(args.where).toMatchObject({
      visibility: 'PUBLIC',
      categoryId: null,
    });
    expect(args.where.OR).toHaveLength(2);
    expect(args.take).toBe(11);
  });

  it('scopes organizer, own and moderation lists', async () => {
    const repo = repository();
    await repo.listPublicByOrganizer('o1', null, 5);
    await repo.listMine('o1', null, 5);
    await repo.listModeration(null, 5);
    const wheres = prisma.event.findMany.mock.calls.map(
      (call: any[]) => call[0].where,
    );
    expect(wheres[0]).toMatchObject({
      organizerId: 'o1',
      visibility: 'PUBLIC',
    });
    expect(wheres[1]).toEqual({ organizerId: 'o1' });
    expect(wheres[2]).toEqual({ status: 'MODERATION' });
    await repo.countModeration();
    expect(prisma.event.count).toHaveBeenCalledWith({
      where: { status: 'MODERATION' },
    });
  });

  it('checks active events and participant access', async () => {
    const repo = repository();
    prisma.event.findFirst.mockResolvedValueOnce({ id: 'e1' });
    expect(await repo.hasActiveEvents('o1')).toBe(true);
    prisma.participantAccess.findUnique.mockResolvedValueOnce({ active: true });
    expect(await repo.hasParticipantAccess('e1', 'u1')).toBe(true);
    prisma.participantAccess.findUnique.mockResolvedValueOnce(null);
    expect(await repo.hasParticipantAccess('e1', 'u1')).toBe(false);
  });

  it('knows public statuses', () => {
    expect(repository().isPublic('ARCHIVED')).toBe(true);
    expect(repository().isPublic('APPROVED')).toBe(false);
  });
});

describe('create', () => {
  const input = {
    title: 'Jazz',
    description: 'Music',
    startTime: future().toISOString(),
    endTime: future(26).toISOString(),
    timeZone: 'UTC',
    location: {
      address: 'A',
      latitude: 1,
      longitude: 2,
      visibility: 'PUBLIC' as const,
    },
    participantLimit: 10,
    chatEnabled: false,
    visibility: 'PUBLIC' as const,
  };

  it('creates an event after locking the organizer', async () => {
    prisma.event.create.mockResolvedValue(stored);
    await repository().create('o1', input);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.event.create.mock.calls[0]![0].data).toMatchObject({
      organizerId: 'o1',
      locationAddress: 'A',
      locationRegion: null,
      categoryId: null,
    });
  });

  it('rejects unknown categories, past starts and deleting accounts', async () => {
    const repo = repository();
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      repo.create('o1', { ...input, categoryId: randomUUID() }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
    await expect(
      repo.create('o1', { ...input, startTime: past().toISOString() }),
    ).rejects.toMatchObject({ code: 'EVENT_TIME_INVALID' });
    prisma.privacyDeletionReservation.findUnique.mockResolvedValueOnce({
      userId: 'o1',
    });
    await expect(repo.create('o1', input)).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_IN_PROGRESS',
    });
  });
});

describe('update', () => {
  it('updates fields and bumps the version', async () => {
    await repository().update(stored.id, stored.organizerId, 'ORGANIZER', {
      title: 'New',
      categoryId: null,
      location: {
        address: 'B',
        latitude: 3,
        longitude: 4,
        visibility: 'PUBLIC',
      },
    });
    expect(updates()[0]).toMatchObject({
      title: 'New',
      category: { disconnect: true },
      locationAddress: 'B',
      version: { increment: 1 },
      policyError: null,
    });
    expect(outbox()).toHaveLength(0);
  });

  it('queues a snapshot with changed details for public events', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await repository().update(stored.id, stored.organizerId, 'ORGANIZER', {
      title: 'New',
    });
    expect(outbox()[0]).toMatchObject({
      eventType: EVENT_TYPES.eventUpdated,
      payload: { title: 'New', detailsChanged: true },
    });
  });

  it('rejects strangers, pending policies and locked statuses', async () => {
    const repo = repository();
    await expect(
      repo.update(stored.id, 'x', 'USER', { title: 'A' }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    stored = eventRow({ pendingPolicyVersion: 2 });
    await expect(
      repo.update(stored.id, stored.organizerId, 'USER', { title: 'A' }),
    ).rejects.toMatchObject({ code: 'POLICY_PENDING' });
    stored = eventRow({ status: 'ONGOING' });
    await expect(
      repo.update(stored.id, stored.organizerId, 'USER', { title: 'A' }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_EDITABLE' });
  });

  it('locks visibility once registration has opened', async () => {
    stored = eventRow({ status: 'PUBLISHED', policyVersion: 1 });
    await expect(
      repository().update(stored.id, stored.organizerId, 'ORGANIZER', {
        visibility: 'UNLISTED',
      }),
    ).rejects.toMatchObject({ code: 'VISIBILITY_LOCKED' });
  });

  it('requests a capacity change through the policy', async () => {
    stored = eventRow({
      status: 'PUBLISHED',
      policyVersion: 1,
      registrationStatus: 'OPEN',
    });
    const repo = repository();
    await expect(
      repo.update(stored.id, stored.organizerId, 'ORGANIZER', {
        participantLimit: 30,
        title: 'x',
      }),
    ).rejects.toMatchObject({ code: 'POLICY_UPDATE_SEPARATE' });
    await repo.update(stored.id, stored.organizerId, 'ORGANIZER', {
      participantLimit: 30,
    });
    expect(updates()[0]).toMatchObject({
      pendingParticipantLimit: 30,
      pendingPolicyVersion: 2,
      pendingRegistrationStatus: 'OPEN',
    });
    expect(outbox()[0]).toMatchObject({
      eventType: EVENT_TYPES.registrationPolicyRequested,
      payload: { capacity: 30, policyVersion: 2, status: 'OPEN' },
    });
  });

  it('returns the event unchanged for the same capacity', async () => {
    stored = eventRow({ policyVersion: 1 });
    expect(
      await repository().update(stored.id, stored.organizerId, 'ORGANIZER', {
        participantLimit: 20,
      }),
    ).toBe(stored);
    expect(prisma.event.update).not.toHaveBeenCalled();
  });

  it('validates times', async () => {
    const repo = repository();
    stored = eventRow({ registrationStatus: 'OPEN' });
    await expect(
      repo.update(stored.id, stored.organizerId, 'ORGANIZER', {
        endTime: future(30).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_OPEN' });
    stored = eventRow({
      status: 'PUBLISHED',
      startTime: past(),
      endTime: future(),
    });
    await expect(
      repo.update(stored.id, stored.organizerId, 'ORGANIZER', {
        startTime: future(1).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_EDITABLE' });
    stored = eventRow();
    await expect(
      repo.update(stored.id, stored.organizerId, 'ORGANIZER', {
        startTime: future(30).toISOString(),
      }),
    ).rejects.toMatchObject({ code: 'EVENT_TIME_INVALID' });
  });

  it('rejects an unknown new category', async () => {
    prisma.category.findUnique.mockResolvedValueOnce(null);
    await expect(
      repository().update(stored.id, stored.organizerId, 'ORGANIZER', {
        categoryId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CATEGORY_NOT_FOUND' });
  });

  it('fails for a missing event', async () => {
    prisma.event.findUnique.mockResolvedValueOnce(null);
    await expect(
      repository().update(randomUUID(), 'x', 'ADMIN', { title: 'A' }),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
  });
});

describe('updateChatSetting', () => {
  it('toggles chat and snapshots public events', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await repository().updateChatSetting(
      stored.id,
      stored.organizerId,
      'ORGANIZER',
      true,
    );
    expect(updates()[0]).toEqual({
      chatEnabled: true,
      version: { increment: 1 },
    });
    expect(outbox()).toHaveLength(1);
  });

  it('skips unchanged values and closed statuses', async () => {
    const repo = repository();
    expect(
      await repo.updateChatSetting(
        stored.id,
        stored.organizerId,
        'ORGANIZER',
        false,
      ),
    ).toBe(stored);
    stored = eventRow({ status: 'COMPLETED' });
    await expect(
      repo.updateChatSetting(stored.id, stored.organizerId, 'ORGANIZER', true),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_EDITABLE' });
  });
});

describe('transition', () => {
  const run = (
    action: any,
    role: any = 'ADMIN',
    reason: string | null = null,
  ) =>
    repository().transition(
      stored.id,
      stored.organizerId,
      role,
      action,
      reason,
    );

  it('submits a draft for moderation', async () => {
    await run('submit', 'ORGANIZER');
    expect(updates()[0]).toMatchObject({
      status: 'MODERATION',
      moderationReason: null,
    });
    expect(outbox()[0]!.eventType).toBe(EVENT_TYPES.eventUpdated);
  });

  it('records the rejection reason', async () => {
    stored = eventRow({ status: 'MODERATION' });
    await run('reject', 'ADMIN', 'Spam');
    expect(updates()[0]).toMatchObject({
      status: 'REJECTED',
      moderationReason: 'Spam',
    });
  });

  it('publishes an approved event as created', async () => {
    stored = eventRow({ status: 'APPROVED' });
    await run('publish', 'ORGANIZER');
    expect(outbox()[0]!.eventType).toBe(EVENT_TYPES.eventCreated);
    stored = eventRow({
      status: 'APPROVED',
      startTime: past(),
      endTime: past(),
    });
    await expect(run('publish')).rejects.toMatchObject({
      code: 'EVENT_TIME_INVALID',
    });
  });

  it('opens and closes registration through the policy', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await run('open');
    expect(updates()[0]).toMatchObject({ pendingRegistrationStatus: 'OPEN' });
    await expect(
      ((stored = eventRow({ status: 'PUBLISHED', registrationStatus: 'OPEN' })),
      run('open')),
    ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
    await run('close');
    expect(outbox().at(-1)).toMatchObject({ payload: { status: 'CLOSED' } });
    stored = eventRow({ status: 'PUBLISHED' });
    await expect(run('close')).rejects.toMatchObject({
      code: 'REGISTRATION_CLOSED',
    });
  });

  it('starts only within the scheduled time', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await expect(run('start')).rejects.toMatchObject({
      code: 'EVENT_TIME_INVALID',
    });
    stored = eventRow({
      status: 'PUBLISHED',
      startTime: past(),
      endTime: future(),
    });
    await run('start');
    expect(updates()[0]).toMatchObject({ status: 'ONGOING' });
  });

  it('completes started events and lists completed participants', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await expect(run('complete')).rejects.toMatchObject({
      code: 'EVENT_TIME_INVALID',
    });
    stored = eventRow({
      status: 'ONGOING',
      startTime: past(),
      endTime: future(),
    });
    prisma.participantAccess.findMany.mockResolvedValue([{ userId: 'u1' }]);
    await run('complete');
    expect(updates()[0]).toMatchObject({
      status: 'COMPLETED',
      registrationStatus: 'CLOSED',
    });
    expect(outbox()[0]!.payload.completedParticipantIds).toEqual(['u1']);
  });

  it('cancels with a reason and announces public cancellations', async () => {
    stored = eventRow({ status: 'PUBLISHED' });
    await run('cancel', 'ADMIN', 'Rain');
    expect(updates()[0]).toMatchObject({
      status: 'CANCELLED',
      cancellationReason: 'Rain',
    });
    expect(outbox()[0]!.eventType).toBe(EVENT_TYPES.eventCancelled);
  });

  it('cancels through the policy once registration existed', async () => {
    stored = eventRow({ status: 'PUBLISHED', policyVersion: 2 });
    await run('cancel', 'ADMIN', 'Rain');
    expect(updates()[0]).toMatchObject({
      pendingStatus: 'CANCELLED',
      pendingCancellationReason: 'Rain',
    });
    expect(outbox()[0]).toMatchObject({ payload: { status: 'CANCELLED' } });
  });

  it('archives without a snapshot for private statuses', async () => {
    stored = eventRow({ status: 'REJECTED' });
    await run('archive');
    expect(updates()[0]).toMatchObject({ status: 'ARCHIVED' });
    expect(outbox()).toHaveLength(0);
  });

  it('enforces roles and pending policies', async () => {
    stored = eventRow({ status: 'MODERATION' });
    await expect(run('approve', 'ORGANIZER')).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    stored = eventRow({ status: 'PUBLISHED', pendingPolicyVersion: 1 });
    await expect(run('cancel')).rejects.toMatchObject({
      code: 'POLICY_PENDING',
    });
  });
});

describe('applyPolicyResult', () => {
  const pending = () =>
    eventRow({
      status: 'PUBLISHED',
      pendingPolicyVersion: 3,
      pendingStatus: 'PUBLISHED',
      pendingRegistrationStatus: 'OPEN',
      pendingParticipantLimit: 40,
    });

  it('ignores duplicates, unknown events and stale versions', async () => {
    const repo = repository();
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repo.applyPolicyResult(
        'i1',
        EVENT_TYPES.registrationPolicyApplied,
        {
          eventId: stored.id,
          policyVersion: 3,
        },
      ),
    ).toBe('duplicate');
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    prisma.event.findUnique.mockResolvedValueOnce(null);
    expect(
      await repo.applyPolicyResult(
        'i2',
        EVENT_TYPES.registrationPolicyApplied,
        {
          eventId: stored.id,
          policyVersion: 3,
        },
      ),
    ).toBe('ignored');
    stored = pending();
    expect(
      await repo.applyPolicyResult(
        'i3',
        EVENT_TYPES.registrationPolicyApplied,
        {
          eventId: stored.id,
          policyVersion: 2,
        },
      ),
    ).toBe('ignored');
  });

  it('applies the pending state', async () => {
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    stored = pending();
    expect(
      await repository().applyPolicyResult(
        'i1',
        EVENT_TYPES.registrationPolicyApplied,
        {
          eventId: stored.id,
          policyVersion: 3,
        },
      ),
    ).toBe('applied');
    expect(updates()[0]).toMatchObject({
      registrationStatus: 'OPEN',
      participantLimit: 40,
      policyVersion: 3,
      pendingPolicyVersion: null,
    });
    expect(outbox()[0]!.eventType).toBe(EVENT_TYPES.eventUpdated);
  });

  it('stores the rejection reason', async () => {
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    stored = pending();
    expect(
      await repository().applyPolicyResult(
        'i1',
        EVENT_TYPES.registrationPolicyRejected,
        {
          eventId: stored.id,
          policyVersion: 3,
          reason: 'CAPACITY_BELOW_OCCUPIED',
        },
      ),
    ).toBe('rejected');
    expect(updates()[0]).toMatchObject({
      policyError: 'CAPACITY_BELOW_OCCUPIED',
      pendingStatus: null,
    });
  });
});

describe('advanceDueEvents', () => {
  it('starts and completes due events', async () => {
    const starting = eventRow({
      status: 'PUBLISHED',
      startTime: past(),
      endTime: future(),
    });
    const ending = eventRow({
      status: 'ONGOING',
      startTime: past(),
      endTime: past(),
    });
    const rows = new Map([
      [starting.id, starting],
      [ending.id, ending],
    ]);
    prisma.event.findMany.mockResolvedValue([
      { id: starting.id },
      { id: ending.id },
    ]);
    prisma.event.findUnique.mockImplementation(async ({ where }: any) =>
      rows.get(where.id),
    );
    await repository().advanceDueEvents();
    const statuses = updates()
      .map((data: any) => data.status)
      .filter(Boolean);
    expect(statuses).toEqual(['ONGOING', 'COMPLETED']);
  });

  it('requests a policy when registration existed and skips pending events', async () => {
    const ended = eventRow({
      status: 'ONGOING',
      endTime: past(),
      policyVersion: 1,
    });
    const busy = eventRow({
      status: 'ONGOING',
      endTime: past(),
      pendingPolicyVersion: 1,
    });
    const rows = new Map([
      [ended.id, ended],
      [busy.id, busy],
    ]);
    prisma.event.findMany.mockResolvedValue([
      { id: ended.id },
      { id: busy.id },
    ]);
    prisma.event.findUnique.mockImplementation(async ({ where }: any) =>
      rows.get(where.id),
    );
    await repository().advanceDueEvents();
    expect(updates()).toHaveLength(1);
    expect(updates()[0]).toMatchObject({ pendingStatus: 'COMPLETED' });
  });
});

describe('reindexPrivateVenueLocations', () => {
  it('queues snapshots for public events with private venues', async () => {
    stored = eventRow({
      status: 'PUBLISHED',
      locationVisibility: 'PARTICIPANTS_ONLY',
    });
    prisma.event.findMany.mockResolvedValue([{ id: stored.id }]);
    expect(await repository().reindexPrivateVenueLocations()).toBe(1);
    expect(outbox()[0]!.payload).not.toHaveProperty('completedParticipantIds');
  });

  it('skips events that changed since the scan', async () => {
    stored = eventRow({ status: 'DRAFT' });
    prisma.event.findMany.mockResolvedValue([{ id: stored.id }]);
    expect(await repository().reindexPrivateVenueLocations()).toBe(0);
  });
});

describe('CategoryRepository', () => {
  it('lists, finds and creates categories', async () => {
    const categories = new CategoryRepository();
    await categories.list();
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      orderBy: { name: 'asc' },
    });
    await categories.findById('c1');
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
    prisma.category.create.mockResolvedValue({ id: 'c1', name: 'Art' });
    expect(await categories.create('Art')).toEqual({ id: 'c1', name: 'Art' });
  });

  it('maps duplicate names to a conflict', async () => {
    prisma.category.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(new CategoryRepository().create('Art')).rejects.toMatchObject({
      code: 'CATEGORY_EXISTS',
    });
    prisma.category.create.mockRejectedValueOnce(new Error('db'));
    await expect(new CategoryRepository().create('Art')).rejects.toThrow('db');
  });
});

describe('PublicEventRepository', () => {
  it('maps rounded public map rows', async () => {
    const row = {
      id: randomUUID(),
      organizerId: randomUUID(),
      categoryId: null,
      categoryName: null,
      title: 'Jazz',
      description: 'Music',
      startTime: new Date('2026-12-01T18:00:00.000Z'),
      endTime: new Date('2026-12-01T20:00:00.000Z'),
      timeZone: 'UTC',
      status: 'PUBLISHED',
      region: 'Kyiv',
      latitude: 50.45,
      longitude: 30.52,
    };
    prisma.$queryRaw.mockResolvedValue([row]);
    const [item] = await new PublicEventRepository().map(50);
    expect(item).toMatchObject({
      distanceMeters: null,
      location: { address: null, latitude: 50.45, visibility: 'PUBLIC' },
    });
    expect(prisma.$queryRaw.mock.calls[0]![0].values).toContain(50);
  });

  it('checks public visibility', async () => {
    prisma.event.findFirst.mockResolvedValueOnce({ id: 'e1' });
    expect(await new PublicEventRepository().isVisible('e1')).toBe(true);
    expect(await new PublicEventRepository().isVisible('e2')).toBe(false);
  });
});

describe('ParticipantAccessRepository', () => {
  const membership = (eventType: any, payload: Record<string, unknown>) =>
    envelope(eventType, 'participation', {
      eventId: stored.id,
      userId: randomUUID(),
      ...payload,
    });
  const membershipPayload = () => ({});

  beforeEach(() => {
    prisma.event.findUnique.mockResolvedValue({ id: stored.id });
    prisma.pendingMembershipEvent.findMany.mockResolvedValue([]);
  });

  it('ignores other event types and duplicates', async () => {
    const repo = new ParticipantAccessRepository();
    expect(
      await repo.apply(envelope(EVENT_TYPES.eventCreated, 'events', {})),
    ).toBe('ignored');
    prisma.inboxEvent.findUnique.mockResolvedValueOnce({ id: 'x' });
    const event = membership(EVENT_TYPES.userJoined, membershipPayload());
    expect(await repo.apply(event)).toBe('duplicate');
  });

  it('grants access on join and parks events with missing predecessors', async () => {
    const repo = new ParticipantAccessRepository();
    const joined = membership(EVENT_TYPES.userJoined, {
      ...membershipPayload(),
      previousMembershipEventId: null,
    });
    expect(await repo.apply(joined)).toBe('processed');
    expect(
      prisma.participantAccess.upsert.mock.calls[0]![0].create,
    ).toMatchObject({
      active: true,
      lastMembershipEventId: joined.eventId,
    });
    const orphan = membership(EVENT_TYPES.userLeft, {
      ...membershipPayload(),
      previousMembershipEventId: randomUUID(),
    });
    expect(await repo.apply(orphan)).toBe('pending');
    expect(prisma.pendingMembershipEvent.createMany).toHaveBeenCalled();
  });

  it('recovers parked membership events', async () => {
    const event = membership(EVENT_TYPES.userJoined, membershipPayload());
    prisma.pendingMembershipEvent.findMany
      .mockResolvedValueOnce([{ id: 'a', envelope: JSON.stringify(event) }])
      .mockResolvedValue([]);
    await new ParticipantAccessRepository().recoverPending();
    expect(prisma.inboxEvent.create).toHaveBeenCalledWith({
      data: { id: event.eventId, eventType: event.eventType },
    });
    expect(EventEnvelopeSchema.parse(event)).toBeTruthy();
  });
});
