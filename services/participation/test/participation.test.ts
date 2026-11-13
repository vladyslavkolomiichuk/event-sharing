import { randomUUID } from 'node:crypto';
import { EVENT_TYPES, RPC_OPERATIONS } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipRow, policyRow, prisma, serviceBus } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));

const { CapacityPolicy } = await import('../src/domain/CapacityPolicy.js');
const { ParticipationService } =
  await import('../src/services/ParticipationService.js');
const { ParticipationRepository } =
  await import('../src/repositories/ParticipationRepository.js');
const { RegistrationPolicyRepository } =
  await import('../src/repositories/RegistrationPolicyRepository.js');

const past = () => new Date(Date.now() - 1000);
const outbox = () =>
  prisma.outboxEvent.create.mock.calls.map((call: any[]) => call[0].data);

beforeEach(() => prisma.reset());

describe('CapacityPolicy', () => {
  const policy = new CapacityPolicy();

  it('allows joining open events with seats', () => {
    expect(() => policy.assertCanJoin(policyRow())).not.toThrow();
  });

  it('rejects closed, ended and full events', () => {
    expect(() => policy.assertCanJoin(policyRow({ status: 'CLOSED' }))).toThrow(
      expect.objectContaining({ code: 'REGISTRATION_CLOSED' }),
    );
    expect(() => policy.assertCanJoin(policyRow({ endTime: past() }))).toThrow(
      expect.objectContaining({ code: 'REGISTRATION_CLOSED' }),
    );
    expect(() => policy.assertCanJoin(policyRow({ occupied: 10 }))).toThrow(
      expect.objectContaining({ code: 'CAPACITY_REACHED' }),
    );
  });
});

describe('ParticipationService', () => {
  let policies: any;
  let participations: any;
  let service: InstanceType<typeof ParticipationService>;
  beforeEach(() => {
    policies = { findByEventId: vi.fn() };
    participations = {
      join: vi.fn(),
      leave: vi.fn(),
      listParticipants: vi.fn(async () => []),
      membership: vi.fn(),
      listMine: vi.fn(async () => []),
    };
    service = new ParticipationService(policies, participations);
  });

  it('reports availability for open, full, ended and missing policies', async () => {
    const eventId = randomUUID();
    policies.findByEventId.mockResolvedValueOnce(policyRow({ eventId }));
    expect(await service.availability(eventId)).toMatchObject({
      status: 'OPEN',
      available: 8,
    });
    policies.findByEventId.mockResolvedValueOnce(
      policyRow({ eventId, occupied: 10 }),
    );
    expect((await service.availability(eventId)).status).toBe('FULL');
    policies.findByEventId.mockResolvedValueOnce(
      policyRow({ eventId, endTime: past() }),
    );
    expect(await service.availability(eventId)).toMatchObject({
      status: 'CLOSED',
      available: 0,
    });
    policies.findByEventId.mockResolvedValueOnce(null);
    await expect(service.availability(eventId)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('maps memberships on join and leave', async () => {
    const row = membershipRow({
      leftAt: new Date('2026-11-02T00:00:00.000Z'),
      status: 'LEFT',
    });
    participations.join.mockResolvedValue(row);
    participations.leave.mockResolvedValue(row);
    expect(await service.join(row.eventId, row.userId)).toMatchObject({
      joinedAt: '2026-11-01T10:00:00.000Z',
      leftAt: '2026-11-02T00:00:00.000Z',
    });
    expect((await service.leave(row.eventId, row.userId)).status).toBe('LEFT');
  });

  it('lists participants for organizers and admins only', async () => {
    const policy = policyRow();
    policies.findByEventId.mockResolvedValue(policy);
    await expect(
      service.participants(policy.eventId, randomUUID(), 'USER', undefined),
    ).rejects.toMatchObject({ statusCode: 403 });
    const rows = Array.from({ length: 21 }, () =>
      membershipRow({ eventId: policy.eventId }),
    );
    participations.listParticipants.mockResolvedValue(rows);
    const list = await service.participants(
      policy.eventId,
      policy.organizerId,
      'ORGANIZER',
      undefined,
    );
    expect(list.items).toHaveLength(20);
    expect(list.nextCursor).toBe(rows[19].userId);
  });

  it('shows member status to the member, organizer and admins', async () => {
    const policy = policyRow();
    const member = membershipRow({ eventId: policy.eventId });
    policies.findByEventId.mockResolvedValue(policy);
    participations.membership.mockResolvedValue(member);
    expect(
      await service.memberStatus(
        policy.eventId,
        member.userId,
        member.userId,
        'USER',
      ),
    ).toEqual({ status: 'JOINED', joinedAt: '2026-11-01T10:00:00.000Z' });
    await expect(
      service.memberStatus(policy.eventId, member.userId, randomUUID(), 'USER'),
    ).rejects.toMatchObject({ statusCode: 404 });
    participations.membership.mockResolvedValue(null);
    expect(
      await service.memberStatus(
        policy.eventId,
        randomUUID(),
        randomUUID(),
        'ADMIN',
      ),
    ).toEqual({ status: null, joinedAt: null });
  });

  it('lists own memberships by event cursor', async () => {
    const row = membershipRow();
    participations.listMine.mockResolvedValue([row]);
    expect(await service.mine(row.userId, undefined)).toMatchObject({
      items: [{ eventId: row.eventId }],
      nextCursor: null,
    });
  });
});

describe('ParticipationRepository.join', () => {
  let policy: any;
  beforeEach(() => {
    policy = policyRow();
    prisma.registrationPolicy.findUnique.mockImplementation(async () => policy);
    prisma.membership.update.mockImplementation(async ({ data }: any) =>
      membershipRow({ ...data, eventId: policy.eventId }),
    );
  });

  it('creates a membership, counts the seat and queues an event', async () => {
    const userId = randomUUID();
    await new ParticipationRepository().join(policy.eventId, userId);
    expect(prisma.membership.create).toHaveBeenCalledWith({
      data: { eventId: policy.eventId, userId },
    });
    expect(prisma.registrationPolicy.update).toHaveBeenCalledWith({
      where: { eventId: policy.eventId },
      data: { occupied: { increment: 1 } },
    });
    expect(outbox()[0]).toMatchObject({
      eventType: EVENT_TYPES.userJoined,
      payload: {
        eventId: policy.eventId,
        userId,
        previousMembershipEventId: null,
      },
    });
  });

  it('returns an existing membership and accepts the invite', async () => {
    const existing = membershipRow({ eventId: policy.eventId });
    prisma.membership.findUnique.mockResolvedValue(existing);
    expect(
      await new ParticipationRepository().join(
        policy.eventId,
        existing.userId,
        'inv',
      ),
    ).toBe(existing);
    expect(prisma.personalInvite.updateMany).toHaveBeenCalled();
    expect(outbox()).toHaveLength(0);
  });

  it('rejoins a former member with the previous event id', async () => {
    const previous = randomUUID();
    prisma.membership.findUnique.mockResolvedValue(
      membershipRow({ status: 'LEFT', lastMembershipEventId: previous }),
    );
    await new ParticipationRepository().join(policy.eventId, randomUUID());
    expect(prisma.membership.update.mock.calls[0]![0].data).toMatchObject({
      status: 'JOINED',
      leftAt: null,
    });
    expect(outbox()[0]!.payload.previousMembershipEventId).toBe(previous);
  });

  it('requires a valid invitation for invite-only events', async () => {
    policy = policyRow({ visibility: 'INVITE_ONLY' });
    const repository = new ParticipationRepository();
    await expect(
      repository.join(policy.eventId, randomUUID()),
    ).rejects.toMatchObject({
      code: 'INVITATION_REQUIRED',
    });
    prisma.personalInvite.findFirst.mockResolvedValueOnce(null);
    await expect(
      repository.join(policy.eventId, randomUUID(), 'inv'),
    ).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    });
    prisma.inviteLink.findFirst.mockResolvedValueOnce({
      id: 'l',
      maxUses: 1,
      uses: 1,
    });
    await expect(
      repository.join(policy.eventId, randomUUID(), undefined, 'hash'),
    ).rejects.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('consumes the invite and link on success', async () => {
    policy = policyRow({ visibility: 'INVITE_ONLY' });
    prisma.personalInvite.findFirst.mockResolvedValueOnce({ id: 'inv' });
    await new ParticipationRepository().join(
      policy.eventId,
      randomUUID(),
      'inv',
    );
    expect(prisma.personalInvite.update).toHaveBeenCalledWith({
      where: { id: 'inv' },
      data: { status: 'ACCEPTED' },
    });
    prisma.inviteLink.findFirst.mockResolvedValueOnce({
      id: 'l',
      maxUses: null,
      uses: 3,
    });
    await new ParticipationRepository().join(
      policy.eventId,
      randomUUID(),
      undefined,
      'hash',
    );
    expect(prisma.inviteLink.update).toHaveBeenCalledWith({
      where: { id: 'l' },
      data: { uses: { increment: 1 } },
    });
  });

  it('fails without a policy or seats', async () => {
    policy = null;
    await expect(
      new ParticipationRepository().join(randomUUID(), randomUUID()),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    policy = policyRow({ occupied: 10 });
    await expect(
      new ParticipationRepository().join(policy.eventId, randomUUID()),
    ).rejects.toMatchObject({ code: 'CAPACITY_REACHED' });
  });
});

describe('ParticipationRepository.leave and lists', () => {
  beforeEach(() => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(policyRow());
  });

  it('frees the seat and queues a leave event', async () => {
    const member = membershipRow({ lastMembershipEventId: randomUUID() });
    prisma.membership.findUnique.mockResolvedValue(member);
    await new ParticipationRepository().leave(member.eventId, member.userId);
    expect(prisma.registrationPolicy.update.mock.calls[0]![0].data).toEqual({
      occupied: { decrement: 1 },
    });
    expect(outbox()[0]).toMatchObject({
      eventType: EVENT_TYPES.userLeft,
      payload: { previousMembershipEventId: member.lastMembershipEventId },
    });
  });

  it('fails for strangers and ignores former members', async () => {
    prisma.membership.findUnique.mockResolvedValueOnce(null);
    await expect(
      new ParticipationRepository().leave(randomUUID(), randomUUID()),
    ).rejects.toMatchObject({ statusCode: 404 });
    const left = membershipRow({ status: 'LEFT' });
    prisma.membership.findUnique.mockResolvedValueOnce(left);
    expect(
      await new ParticipationRepository().leave(left.eventId, left.userId),
    ).toBe(left);
  });

  it('pages participants and own memberships', async () => {
    const repository = new ParticipationRepository();
    await repository.listParticipants('e1', 'u5');
    expect(prisma.membership.findMany.mock.calls[0]![0]).toMatchObject({
      where: { eventId: 'e1', status: 'JOINED', userId: { gt: 'u5' } },
      take: 21,
    });
    await repository.listMine('u1', undefined);
    expect(prisma.membership.findMany.mock.calls[1]![0].where).toEqual({
      userId: 'u1',
      status: 'JOINED',
      hiddenAt: null,
    });
    await repository.membership('e1', 'u1');
    expect(prisma.membership.findUnique).toHaveBeenCalled();
  });
});

describe('RegistrationPolicyRepository', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    eventId: randomUUID(),
    organizerId: randomUUID(),
    policyVersion: 1,
    status: 'OPEN' as const,
    capacity: 10,
    endTime: new Date(Date.now() + 86400000).toISOString(),
    visibility: 'PUBLIC' as const,
    title: 'Jazz',
    ...overrides,
  });
  let current: any;
  beforeEach(() => {
    current = null;
    prisma.registrationPolicy.findUnique.mockImplementation(
      async () => current,
    );
    prisma.personalInvite.findMany.mockResolvedValue([]);
    prisma.pendingPolicyEvent.createMany.mockResolvedValue({ count: 1 });
  });
  const eventTypes = () => outbox().map((data: any) => data.eventType);

  it('creates the first policy and confirms it', async () => {
    const input = request();
    expect(await new RegistrationPolicyRepository().apply('m1', input)).toBe(
      'applied',
    );
    expect(
      prisma.registrationPolicy.create.mock.calls[0]![0].data,
    ).toMatchObject({
      eventId: input.eventId,
      version: 1,
      capacity: 10,
    });
    expect(eventTypes()).toEqual([EVENT_TYPES.registrationPolicyApplied]);
  });

  it('skips duplicates and stale versions', async () => {
    const repository = new RegistrationPolicyRepository();
    prisma.inboxEvent.findUnique.mockResolvedValueOnce({ id: 'm1' });
    expect(await repository.apply('m1', request())).toBe('duplicate');
    current = policyRow({ version: 3 });
    expect(await repository.apply('m2', request({ policyVersion: 2 }))).toBe(
      'ignored',
    );
  });

  it('parks versions that arrive early', async () => {
    expect(
      await new RegistrationPolicyRepository().apply(
        'm1',
        request({ policyVersion: 3 }),
      ),
    ).toBe('pending');
    expect(prisma.pendingPolicyEvent.createMany).toHaveBeenCalled();
  });

  it('rejects conflicting parked versions', async () => {
    prisma.pendingPolicyEvent.createMany.mockResolvedValue({ count: 0 });
    prisma.pendingPolicyEvent.findUnique.mockResolvedValue(null);
    await expect(
      new RegistrationPolicyRepository().apply(
        'm1',
        request({ policyVersion: 3 }),
      ),
    ).rejects.toThrow('Conflicting registration policy version.');
  });

  it('rejects changes after cancellation, after the end and below occupancy', async () => {
    const repository = new RegistrationPolicyRepository();
    current = policyRow({ status: 'CANCELLED', version: 1 });
    expect(await repository.apply('a', request({ policyVersion: 2 }))).toBe(
      'rejected',
    );
    current = policyRow({ version: 1 });
    expect(
      await repository.apply(
        'b',
        request({
          policyVersion: 2,
          endTime: new Date(Date.now() - 1000).toISOString(),
        }),
      ),
    ).toBe('rejected');
    current = policyRow({ version: 1, occupied: 8 });
    expect(
      await repository.apply('c', request({ policyVersion: 2, capacity: 5 })),
    ).toBe('rejected');
    expect(outbox().map((data: any) => data.payload.reason)).toEqual([
      'POLICY_ALREADY_CANCELLED',
      'REGISTRATION_DEADLINE_PASSED',
      'CAPACITY_BELOW_OCCUPIED',
    ]);
  });

  it('cancels memberships and frees seats on cancellation', async () => {
    current = policyRow({ version: 1, occupied: 4 });
    await new RegistrationPolicyRepository().apply(
      'm1',
      request({
        eventId: current.eventId,
        policyVersion: 2,
        status: 'CANCELLED',
      }),
    );
    expect(prisma.membership.updateMany.mock.calls[0]![0].data.status).toBe(
      'CANCELLED',
    );
    expect(
      prisma.registrationPolicy.update.mock.calls[0]![0].data.occupied,
    ).toBe(0);
  });

  it('notifies waiting invitees when registration opens', async () => {
    prisma.personalInvite.findMany.mockResolvedValue([
      { id: 'i1', recipientId: randomUUID(), senderId: randomUUID() },
    ]);
    await new RegistrationPolicyRepository().apply('m1', request());
    expect(eventTypes()).toEqual([
      EVENT_TYPES.invitationSent,
      EVENT_TYPES.registrationPolicyApplied,
    ]);
    expect(prisma.personalInvite.update.mock.calls[0]![0]).toMatchObject({
      where: { id: 'i1' },
    });
  });

  it('drains parked versions in order', async () => {
    const input = request();
    const next = request({ eventId: input.eventId, policyVersion: 2 });
    let version = 0;
    prisma.registrationPolicy.findUnique.mockImplementation(async () =>
      version
        ? policyRow({ eventId: input.eventId, version, occupied: 0 })
        : null,
    );
    prisma.registrationPolicy.create.mockImplementation(async () => {
      version = 1;
    });
    prisma.registrationPolicy.update.mockImplementation(
      async ({ data }: any) => {
        version = data.version;
      },
    );
    prisma.pendingPolicyEvent.findUnique.mockImplementation(
      async ({ where }: any) =>
        where.aggregateId_policyVersion?.policyVersion === 2 && version === 1
          ? { id: 'm2', payload: next }
          : null,
    );
    await new RegistrationPolicyRepository().apply('m1', input);
    expect(version).toBe(2);
    prisma.pendingPolicyEvent.findMany.mockResolvedValue([
      { aggregateId: input.eventId },
    ]);
    await new RegistrationPolicyRepository().recoverPending();
    expect(prisma.pendingPolicyEvent.findMany).toHaveBeenCalled();
  });
});

describe('directory clients', () => {
  it('resolve users, events and history access over RPC', async () => {
    const { UserDirectoryClient } =
      await import('../src/clients/UserDirectoryClient.js');
    const { EventDirectoryClient } =
      await import('../src/clients/EventDirectoryClient.js');
    const { HistoryAccessClient } =
      await import('../src/clients/HistoryAccessClient.js');
    const userId = randomUUID();
    serviceBus.call.mockResolvedValueOnce({
      userId,
      username: 'iryna',
      name: 'Iryna',
    });
    expect(
      await new UserDirectoryClient().resolve('iryna', 'Bearer t'),
    ).toEqual({
      userId,
      username: 'iryna',
      name: 'Iryna',
    });
    expect(serviceBus.call).toHaveBeenLastCalledWith(
      'users',
      RPC_OPERATIONS.invitationTarget,
      { username: 'iryna' },
      'Bearer t',
    );
    serviceBus.call.mockResolvedValueOnce({ bad: true });
    await expect(
      new EventDirectoryClient().get(randomUUID(), 'Bearer t'),
    ).rejects.toThrow();
    serviceBus.call.mockResolvedValueOnce({ allowed: true });
    await expect(
      new HistoryAccessClient().check(userId, 'Bearer t'),
    ).resolves.toBeUndefined();
    serviceBus.call.mockResolvedValueOnce({ allowed: false });
    await expect(
      new HistoryAccessClient().check(userId, 'Bearer t'),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
