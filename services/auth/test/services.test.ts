import { randomUUID } from 'node:crypto';
import {
  DELETION_SERVICES,
  EVENT_TYPES,
  RPC_OPERATIONS,
} from '@event-sharing/contracts';
import {
  MailMessageCipher,
  ServiceMessageCipher,
  ServiceRpcError,
} from '@event-sharing/messaging';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma, serviceBus } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));

const { UserIdentityService } =
  await import('../src/services/UserIdentityService.js');
const { UserIdentityRepository } =
  await import('../src/repositories/UserIdentityRepository.js');
const { UserRoleService } = await import('../src/services/UserRoleService.js');
const { UserRoleRepository } =
  await import('../src/repositories/UserRoleRepository.js');
const { OrganizerRequestService } =
  await import('../src/services/OrganizerRequestService.js');
const { OrganizerRequestRepository } =
  await import('../src/repositories/OrganizerRequestRepository.js');
const { AuthMailService } = await import('../src/services/AuthMailService.js');
const { MailRequestRepository } =
  await import('../src/repositories/MailRequestRepository.js');
const { DeletionEligibilityClient } =
  await import('../src/clients/DeletionEligibilityClient.js');
const { PrivacyServiceClient } =
  await import('../src/clients/PrivacyServiceClient.js');
const { PrivacyDeletionRepository } =
  await import('../src/repositories/PrivacyDeletionRepository.js');
const { PrivacyDeletionCoordinator } =
  await import('../src/services/PrivacyDeletionCoordinator.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

const duplicate = () =>
  new Prisma.PrismaClientKnownRequestError('dup', {
    code: 'P2002',
    clientVersion: 'x',
  });

beforeEach(() => prisma.reset());

describe('UserIdentity', () => {
  it('checks availability and suggests free usernames', async () => {
    const service = new UserIdentityService();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    expect(await service.available('iryna')).toBe(true);
    prisma.user.findMany.mockResolvedValue([{ username: 'iryna_melnyk' }]);
    expect(await service.suggestions('Ірина Мельник')).toEqual([
      'irynamelnyk',
      'iryna_melnyk2',
    ]);
    expect(await new UserIdentityRepository().availableSuggestions([])).toEqual(
      [],
    );
  });

  it('updates only provided fields and maps taken usernames', async () => {
    const service = new UserIdentityService();
    prisma.user.update.mockResolvedValueOnce({
      id: 'u1',
      name: 'New',
      username: 'x',
    });
    await service.update('u1', { name: 'New' });
    expect(prisma.user.update.mock.calls[0]![0].data).toEqual({ name: 'New' });
    prisma.user.update.mockRejectedValueOnce(duplicate());
    await expect(
      service.update('u1', { username: 'taken' }),
    ).rejects.toMatchObject({
      code: 'USERNAME_TAKEN',
    });
    prisma.user.update.mockRejectedValueOnce(new Error('db'));
    await expect(service.update('u1', { username: 'x' })).rejects.toThrow('db');
  });
});

describe('UserRoleService', () => {
  const repository = { findByUsername: vi.fn(), updateRole: vi.fn() };
  const service = new UserRoleService(repository as never);

  it('lets only admins change roles', async () => {
    await expect(
      service.changeRole('a', 'ORGANIZER', 'x', 'ADMIN'),
    ).rejects.toMatchObject({
      statusCode: 403,
    });
    repository.findByUsername.mockResolvedValueOnce(null);
    await expect(
      service.changeRole('a', 'ADMIN', 'x', 'ADMIN'),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('blocks self demotion and updates others', async () => {
    repository.findByUsername.mockResolvedValue({ id: 'a' });
    await expect(
      service.changeRole('a', 'ADMIN', 'me', 'USER'),
    ).rejects.toMatchObject({
      code: 'SELF_DEMOTION_NOT_ALLOWED',
    });
    repository.findByUsername.mockResolvedValue({ id: 'b' });
    expect(await service.changeRole('a', 'ADMIN', 'B', 'ORGANIZER')).toEqual({
      id: 'b',
      role: 'ORGANIZER',
    });
    expect(repository.updateRole).toHaveBeenCalledWith('b', 'ORGANIZER', 'a');
  });
});

describe('UserRoleRepository', () => {
  it('lowercases usernames', async () => {
    await new UserRoleRepository().findByUsername('Iryna');
    expect(prisma.user.findUnique.mock.calls[0]![0].where).toEqual({
      username: 'iryna',
    });
  });

  it('approves a pending organizer request on promotion', async () => {
    prisma.organizerRequest.findFirst.mockResolvedValue({ id: 'r1' });
    prisma.organizerRequest.updateMany.mockResolvedValue({ count: 1 });
    await new UserRoleRepository().updateRole('u1', 'ORGANIZER', 'a1');
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data).toMatchObject({
      eventType: EVENT_TYPES.organizerRequestResolved,
      payload: { requestId: 'r1', status: 'APPROVED', decidedById: 'a1' },
    });
  });

  it('only updates the role on demotion', async () => {
    await new UserRoleRepository().updateRole('u1', 'USER', 'a1');
    expect(prisma.organizerRequest.findFirst).not.toHaveBeenCalled();
  });
});

describe('organizer requests', () => {
  const row = (overrides = {}) => ({
    id: randomUUID(),
    userId: randomUUID(),
    status: 'PENDING',
    reason: 'I run a jazz club in Kyiv.',
    decisionReason: null,
    requestedAt: new Date('2026-11-01T00:00:00.000Z'),
    decidedAt: null,
    ...overrides,
  });

  it('maps current, pending and created requests', async () => {
    const repository = {
      current: vi.fn(async () => null),
      pending: vi.fn(async () => [
        { ...row(), user: { id: randomUUID(), name: 'I', username: 'iryna' } },
      ]),
      countPending: vi.fn(async () => 1),
      create: vi.fn(async () => row()),
      decide: vi.fn(async () =>
        row({ status: 'APPROVED', decidedAt: new Date() }),
      ),
    };
    const service = new OrganizerRequestService(repository as never);
    expect(await service.current('u')).toBeNull();
    const pending = await service.pending();
    expect(pending.total).toBe(1);
    expect(pending.requests[0]!.requester.username).toBe('iryna');
    expect((await service.create('u', 'reason')).requestedAt).toBe(
      '2026-11-01T00:00:00.000Z',
    );
    await expect(
      service.decide('r', 'a', 'REJECTED', 'short'),
    ).rejects.toMatchObject({
      code: 'DECISION_REASON_REQUIRED',
    });
    expect((await service.decide('r', 'a', 'APPROVED')).status).toBe(
      'APPROVED',
    );
    expect(repository.decide).toHaveBeenCalledWith('r', 'a', 'APPROVED', null);
  });

  it('creates a request only for complete users without a role', async () => {
    const repository = new OrganizerRequestRepository();
    prisma.user.findUnique.mockResolvedValueOnce({
      username: `user_${'a'.repeat(24)}`,
      role: 'USER',
    });
    await expect(repository.create('u', 'r')).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
    });
    prisma.user.findUnique.mockResolvedValueOnce({
      username: 'iryna',
      role: 'ORGANIZER',
    });
    await expect(repository.create('u', 'r')).rejects.toMatchObject({
      code: 'ROLE_ALREADY_GRANTED',
    });
    prisma.user.findUnique.mockResolvedValue({
      name: 'Iryna',
      username: 'iryna',
      role: 'USER',
    });
    prisma.organizerRequest.create.mockImplementation(
      async ({ data }: any) => data,
    );
    await repository.create('u', 'r');
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data.eventType).toBe(
      EVENT_TYPES.organizerRequestSubmitted,
    );
  });

  it('returns the pending request on races', async () => {
    const repository = new OrganizerRequestRepository();
    const existing = row();
    prisma.user.findUnique.mockResolvedValue({
      name: 'I',
      username: 'iryna',
      role: 'USER',
    });
    prisma.organizerRequest.findFirst.mockResolvedValueOnce(existing);
    expect(await repository.create('u', 'r')).toBe(existing);
    prisma.organizerRequest.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);
    prisma.organizerRequest.create.mockRejectedValueOnce(duplicate());
    expect(await repository.create('u', 'r')).toBe(existing);
  });

  it('decides once and promotes approved users', async () => {
    const repository = new OrganizerRequestRepository();
    prisma.organizerRequest.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(
      repository.decide('r', 'a', 'APPROVED', null),
    ).rejects.toMatchObject({
      code: 'ROLE_REQUEST_CONFLICT',
    });
    prisma.organizerRequest.updateMany.mockResolvedValue({ count: 1 });
    prisma.organizerRequest.findUniqueOrThrow.mockResolvedValue({
      userId: 'u',
      user: { role: 'USER' },
    });
    await repository.decide('r', 'a', 'APPROVED', null);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u' },
      data: { role: 'ORGANIZER' },
    });
    await repository.current('u');
    await repository.pending();
    await repository.countPending();
    expect(prisma.organizerRequest.count).toHaveBeenCalled();
  });
});

describe('auth mail', () => {
  it('encrypts and queues mail unless deletion froze the account', async () => {
    const repository = { enqueue: vi.fn() };
    const cipher = new MailMessageCipher('33'.repeat(32));
    const service = new AuthMailService(repository as never, cipher);
    await service.queue(
      'u1',
      'PASSWORD_RESET',
      'a@example.test',
      'https://app.test/r',
    );
    const payload = repository.enqueue.mock.calls[0]![1];
    expect(cipher.decrypt(payload)).toMatchObject({
      recipient: 'a@example.test',
    });
    prisma.privacyDeletionJob.findFirst.mockResolvedValue({ requestId: 'r' });
    await service.queue(
      'u1',
      'PASSWORD_RESET',
      'a@example.test',
      'https://app.test/r',
    );
    expect(repository.enqueue).toHaveBeenCalledTimes(1);
  });

  it('writes the mail request to the outbox under the user lock', async () => {
    const payload = {
      iv: 'a',
      tag: 'b',
      ciphertext: 'c',
      expiresAt: new Date().toISOString(),
    };
    await new MailRequestRepository().enqueue('u1', payload);
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data).toEqual({
      aggregateId: 'u1',
      eventType: EVENT_TYPES.notificationRequested,
      payload,
    });
    prisma.privacyDeletionJob.findFirst.mockResolvedValue({});
    await new MailRequestRepository().enqueue('u1', payload);
    expect(prisma.outboxEvent.create).toHaveBeenCalledTimes(1);
  });
});

describe('clients', () => {
  it('checks active events with the user token', async () => {
    const client = new DeletionEligibilityClient();
    await expect(client.hasActiveEvents(undefined)).rejects.toMatchObject({
      statusCode: 503,
    });
    serviceBus.call.mockResolvedValueOnce({ hasActiveEvents: true });
    expect(await client.hasActiveEvents('t')).toBe(true);
    expect(serviceBus.call).toHaveBeenLastCalledWith(
      'events',
      RPC_OPERATIONS.activeEvents,
      {},
      'Bearer t',
    );
  });

  it('seals privacy commands and checks the reply', async () => {
    const client = new PrivacyServiceClient();
    const cipher = new ServiceMessageCipher('22'.repeat(32));
    const work = {
      requestId: randomUUID(),
      userId: randomUUID(),
      eventIds: [],
      removedEventIds: [],
      mailRequestIds: [],
    };
    serviceBus.call.mockImplementationOnce(
      async (_service, operation, sealed) => {
        expect(cipher.decode(sealed)).toEqual({ operation, work });
        return cipher.encode({
          requestId: work.requestId,
          operation,
          result: { ok: true },
        });
      },
    );
    expect(await client.erase('users', work)).toEqual({ ok: true });
    serviceBus.call.mockResolvedValueOnce(
      cipher.encode({
        requestId: randomUUID(),
        operation: RPC_OPERATIONS.privacyReserve,
        result: 1,
      }),
    );
    await expect(client.erase('events', work, true)).rejects.toThrow();
  });
});

describe('PrivacyDeletionRepository', () => {
  it('creates a job with one step per service', async () => {
    prisma.privacyRequest.createMany.mockResolvedValue({ count: 1 });
    prisma.privacyRequest.findFirstOrThrow.mockResolvedValue({
      id: 'r1',
      userId: 'u1',
    });
    const result = await new PrivacyDeletionRepository().request('u1');
    expect(result.receipt).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(
      prisma.privacyDeletionJob.create.mock.calls[0]![0].data.steps.create,
    ).toHaveLength(DELETION_SERVICES.length);
  });

  it('freezes the account and stores pending mail ids', async () => {
    prisma.privacyDeletionJob.findUniqueOrThrow.mockResolvedValue({
      userId: 'u1',
      frozenAt: null,
    });
    prisma.outboxEvent.findMany.mockResolvedValue([{ id: 'm1' }]);
    await new PrivacyDeletionRepository().freeze('r1', {
      eventIds: [],
      removedEventIds: [],
    });
    expect(
      prisma.privacyDeletionJob.update.mock.calls[0]![0].data.context,
    ).toEqual({
      eventIds: [],
      removedEventIds: [],
      mailRequestIds: ['m1'],
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
    });
  });

  it('finishes only after other services acknowledged', async () => {
    const repository = new PrivacyDeletionRepository();
    prisma.privacyDeletionJob.findUniqueOrThrow.mockResolvedValueOnce({
      userId: 'u1',
      completedAt: null,
      steps: [{ service: 'users', completedAt: null }],
    });
    await expect(repository.finish('r1')).rejects.toThrow(
      'Deletion acknowledgements are incomplete.',
    );
    prisma.privacyDeletionJob.findUniqueOrThrow.mockResolvedValueOnce({
      userId: 'u1',
      completedAt: null,
      steps: [
        { service: 'users', completedAt: new Date() },
        { service: 'auth', completedAt: null },
      ],
    });
    prisma.user.findUnique.mockResolvedValue({ email: 'a@example.test' });
    await repository.finish('r1');
    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: 'u1' },
    });
    expect(
      prisma.privacyDeletionJob.update.mock.calls[0]![0].data,
    ).toMatchObject({
      userId: null,
      context: {},
    });
  });

  it('rejects jobs, records attempts and backs off', async () => {
    const repository = new PrivacyDeletionRepository();
    await repository.reject('r1', 'ACTIVE_EVENTS_BLOCK_DELETION');
    expect(prisma.privacyRequest.updateMany.mock.calls[0]![0].data.status).toBe(
      'REJECTED',
    );
    await repository.recordAttempt('r1', 'users');
    await repository.completeStep('r1', 'users');
    const before = Date.now();
    await repository.retryLater('r1', 'users', 20);
    const next =
      prisma.privacyDeletionStep.updateMany.mock.calls[1]![0].data
        .nextAttemptAt;
    expect(next.getTime() - before).toBeLessThanOrEqual(300_000 + 50);
    await repository.pendingJobs('r0');
    expect(
      prisma.privacyDeletionJob.findMany.mock.calls[0]![0].where.requestId,
    ).toEqual({ gt: 'r0' });
  });
});

describe('PrivacyDeletionCoordinator', () => {
  const lock = {
    run: vi.fn(async (work: () => Promise<void>) => work()),
    close: vi.fn(),
  };
  const job = (service: string, extra = {}) => ({
    requestId: randomUUID(),
    userId: randomUUID(),
    frozenAt: null,
    context: {},
    steps: [{ service, completedAt: null, nextAttemptAt: new Date(0) }],
    ...extra,
  });
  const setup = (jobs: unknown[]) => {
    const repository = {
      pendingJobs: vi.fn().mockResolvedValueOnce(jobs).mockResolvedValue([]),
      recordAttempt: vi.fn(async () => ({ attempts: 1 })),
      finish: vi.fn(),
      freeze: vi.fn(),
      completeStep: vi.fn(),
      reject: vi.fn(),
      retryLater: vi.fn(),
    };
    const client = {
      erase: vi.fn(async () => ({ eventIds: [], removedEventIds: [] })),
    };
    return {
      repository,
      client,
      coordinator: new PrivacyDeletionCoordinator(
        repository as never,
        client as never,
        lock as never,
      ),
    };
  };

  it('reserves events and freezes the account', async () => {
    const { coordinator, repository, client } = setup([
      job('events-reservation'),
    ]);
    await coordinator.runOnce();
    expect(client.erase.mock.calls[0]![0]).toBe('events');
    expect(client.erase.mock.calls[0]![2]).toBe(true);
    expect(repository.freeze).toHaveBeenCalled();
    expect(repository.completeStep).toHaveBeenCalled();
  });

  it('finishes with the auth step and waits after freezing', async () => {
    const { coordinator, repository } = setup([
      job('auth'),
      job('users', { frozenAt: new Date() }),
    ]);
    await coordinator.runOnce();
    expect(repository.finish).toHaveBeenCalledTimes(1);
    expect(repository.recordAttempt).toHaveBeenCalledTimes(1);
  });

  it('stores participation results in the job context', async () => {
    const { coordinator } = setup([job('participation')]);
    await coordinator.runOnce();
    expect(prisma.privacyDeletionJob.update).toHaveBeenCalled();
  });

  it('rejects deletion blocked by active events and retries other failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { coordinator, repository, client } = setup([
      job('events-reservation'),
      job('users'),
    ]);
    client.erase
      .mockRejectedValueOnce(
        new ServiceRpcError('Active.', 'ACTIVE_EVENTS_BLOCK_DELETION', 409),
      )
      .mockRejectedValueOnce(new Error('down'));
    await coordinator.runOnce();
    expect(repository.reject).toHaveBeenCalledWith(
      expect.any(String),
      'ACTIVE_EVENTS_BLOCK_DELETION',
    );
    expect(repository.retryLater).toHaveBeenCalledTimes(1);
  });
});
