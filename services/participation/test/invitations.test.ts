import { createHash, randomUUID } from 'node:crypto';
import { EVENT_TYPES } from '@event-sharing/contracts';
import { ServiceRpcError } from '@event-sharing/messaging';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventDetail } from '../../../test/fixtures.js';
import { membershipRow, policyRow, prisma } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));

const { InvitationService } =
  await import('../src/services/InvitationService.js');
const { ParticipationHistoryService } =
  await import('../src/services/ParticipationHistoryService.js');
const { EventDirectoryClient } =
  await import('../src/clients/EventDirectoryClient.js');

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');
const future = (hours = 2) => new Date(Date.now() + hours * 3600000);
const past = () => new Date(Date.now() - 1000);

let directory: any;
let events: any;
let participations: any;
let service: InstanceType<typeof InvitationService>;
beforeEach(() => {
  prisma.reset();
  directory = { resolve: vi.fn() };
  events = { get: vi.fn() };
  participations = { join: vi.fn(async () => membershipRow()) };
  service = new InvitationService(directory, events, participations);
});

describe('invite links', () => {
  const privatePolicy = () =>
    policyRow({ visibility: 'INVITE_ONLY', endTime: future(48) });

  it('creates a hashed link for private open events', async () => {
    const policy = privatePolicy();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.inviteLink.create.mockImplementation(async ({ data }: any) => ({
      id: 'l1',
      ...data,
    }));
    const link = await service.createLink(
      policy.eventId,
      policy.organizerId,
      future(),
      5,
    );
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(prisma.inviteLink.create.mock.calls[0]![0].data.tokenHash).toBe(
      hash(link.token),
    );
    expect(link.maxUses).toBe(5);
  });

  it('rejects links for strangers, public events and bad expiry', async () => {
    const policy = privatePolicy();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    await expect(
      service.createLink(policy.eventId, randomUUID(), future(), null),
    ).rejects.toMatchObject({ code: 'EVENT_NOT_FOUND' });
    await expect(
      service.createLink(policy.eventId, policy.organizerId, future(72), null),
    ).rejects.toThrow('Link expiration must be before the event ends.');
    prisma.registrationPolicy.findUnique.mockResolvedValue({
      ...policy,
      visibility: 'PUBLIC',
    });
    await expect(
      service.createLink(policy.eventId, policy.organizerId, future(), null),
    ).rejects.toThrow('Invite links are only for private events.');
    prisma.registrationPolicy.findUnique.mockResolvedValue({
      ...policy,
      status: 'CLOSED',
    });
    await expect(
      service.createLink(policy.eventId, policy.organizerId, future(), null),
    ).rejects.toMatchObject({ code: 'REGISTRATION_CLOSED' });
  });

  it('lists and revokes links for the organizer', async () => {
    const policy = privatePolicy();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    await service.listLinks(policy.eventId, policy.organizerId);
    expect(
      prisma.inviteLink.findMany.mock.calls[0]![0].select,
    ).not.toHaveProperty('tokenHash');
    await service.revokeLink(policy.eventId, policy.organizerId, 'l1');
    expect(prisma.inviteLink.updateMany.mock.calls[0]![0].where).toMatchObject({
      id: 'l1',
      revokedAt: null,
    });
  });

  it('previews only usable links', async () => {
    const policy = privatePolicy();
    const link = {
      eventId: policy.eventId,
      revokedAt: null,
      expiresAt: future(),
      maxUses: 2,
      uses: 1,
    };
    prisma.inviteLink.findUnique.mockResolvedValue(link);
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    expect(await service.previewLink('t')).toMatchObject({
      eventId: policy.eventId,
      title: 'Jazz night',
    });
    prisma.inviteLink.findUnique.mockResolvedValue({ ...link, uses: 2 });
    await expect(service.previewLink('t')).rejects.toMatchObject({
      code: 'INVITATION_INVALID',
    });
    prisma.inviteLink.findUnique.mockResolvedValue(link);
    prisma.registrationPolicy.findUnique.mockResolvedValue({
      ...policy,
      status: 'CLOSED',
    });
    await expect(service.previewLink('t')).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('accepts a link or returns the existing membership', async () => {
    const policy = privatePolicy();
    prisma.inviteLink.findUnique.mockResolvedValue({
      eventId: policy.eventId,
      revokedAt: null,
      expiresAt: future(),
      maxUses: null,
      uses: 0,
    });
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    await service.acceptLink('token', 'u1');
    expect(participations.join).toHaveBeenCalledWith(
      policy.eventId,
      'u1',
      undefined,
      hash('token'),
    );
    const member = membershipRow();
    prisma.membership.findUnique.mockResolvedValue(member);
    expect(await service.acceptLink('token', 'u1')).toBe(member);
  });
});

describe('personal invitations', () => {
  const target = (username: string) => ({
    userId: randomUUID(),
    username,
    name: username,
  });

  it('sends invitations and notifies when registration is open', async () => {
    const policy = policyRow({ endTime: future(48) });
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    const iryna = target('iryna');
    directory.resolve.mockResolvedValueOnce(iryna).mockResolvedValueOnce(iryna);
    const result = await service.send(
      policy.eventId,
      policy.organizerId,
      ['iryna', 'iryna'],
      'B',
    );
    expect(result).toEqual({
      sent: [{ username: 'iryna', name: 'iryna' }],
      skipped: 0,
    });
    expect(prisma.personalInvite.create).toHaveBeenCalledTimes(1);
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data.eventType).toBe(
      EVENT_TYPES.invitationSent,
    );
  });

  it('skips members and pending invites and refreshes old invites', async () => {
    const policy = policyRow({ endTime: future(48), status: 'CLOSED' });
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    const [a, b, c] = [target('aaa'), target('bbb'), target('ccc')];
    directory.resolve.mockImplementation(
      async (name: string) => ({ aaa: a, bbb: b, ccc: c })[name],
    );
    prisma.membership.findUnique.mockImplementation(async ({ where }: any) =>
      where.eventId_userId.userId === a.userId ? membershipRow() : null,
    );
    prisma.personalInvite.findUnique.mockImplementation(
      async ({ where }: any) => {
        const id = where.eventId_recipientId.recipientId;
        if (id === b.userId)
          return { id: 'ib', status: 'PENDING', expiresAt: future() };
        if (id === c.userId)
          return { id: 'ic', status: 'DECLINED', expiresAt: past() };
        return null;
      },
    );
    const result = await service.send(
      policy.eventId,
      policy.organizerId,
      ['aaa', 'bbb', 'ccc'],
      'B',
    );
    expect(result).toEqual({
      sent: [{ username: 'ccc', name: 'ccc' }],
      skipped: 2,
    });
    expect(prisma.personalInvite.update.mock.calls[0]![0].where).toEqual({
      id: 'ic',
    });
    expect(prisma.outboxEvent.create).not.toHaveBeenCalled();
  });

  it('uses the event detail before a policy exists', async () => {
    const event = eventDetail({ status: 'APPROVED' });
    prisma.registrationPolicy.findUnique.mockResolvedValue(null);
    events.get.mockResolvedValue(event);
    directory.resolve.mockResolvedValue(target('olena'));
    const result = await service.send(
      event.id,
      event.organizerId,
      ['olena'],
      'B',
    );
    expect(result.sent).toHaveLength(1);
    await expect(
      service.send(event.id, randomUUID(), ['olena'], 'B'),
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
    events.get.mockResolvedValue({ ...event, status: 'COMPLETED' });
    await expect(
      service.send(event.id, event.organizerId, ['olena'], 'B'),
    ).rejects.toMatchObject({
      code: 'REGISTRATION_CLOSED',
    });
  });

  it('expires old invites before listing', async () => {
    prisma.personalInvite.findMany.mockResolvedValue([
      { eventId: 'e1' },
      { eventId: 'e2' },
    ]);
    prisma.registrationPolicy.findMany.mockResolvedValue([
      { eventId: 'e1', visibility: 'INVITE_ONLY' },
    ]);
    const invites = await service.incoming('u1');
    expect(prisma.personalInvite.updateMany.mock.calls[0]![0].data).toEqual({
      status: 'EXPIRED',
    });
    expect(invites.map((invite) => invite.visibility)).toEqual([
      'INVITE_ONLY',
      'PUBLIC',
    ]);
    const policy = policyRow();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    await service.outgoing(policy.eventId, policy.organizerId, 'B');
    await expect(
      service.outgoing(policy.eventId, 'x', 'B'),
    ).rejects.toMatchObject({
      code: 'EVENT_NOT_FOUND',
    });
  });

  it('accepts, declines and revokes invitations', async () => {
    prisma.personalInvite.findFirst.mockResolvedValueOnce(null);
    await expect(service.accept('i1', 'u1')).rejects.toMatchObject({
      code: 'INVITATION_NOT_FOUND',
    });
    prisma.personalInvite.findFirst.mockResolvedValueOnce({ eventId: 'e1' });
    await service.accept('i1', 'u1');
    expect(participations.join).toHaveBeenCalledWith('e1', 'u1', 'i1');
    await service.decline('i1', 'u1');
    expect(prisma.personalInvite.updateMany.mock.calls[0]![0].data).toEqual({
      status: 'DECLINED',
    });
    prisma.personalInvite.findUnique.mockResolvedValueOnce({
      senderId: 'other',
    });
    await expect(service.revoke('i1', 'u1')).rejects.toMatchObject({
      statusCode: 404,
    });
    prisma.personalInvite.findUnique.mockResolvedValueOnce({ senderId: 'u1' });
    await service.revoke('i1', 'u1');
    expect(prisma.personalInvite.updateMany.mock.calls[1]![0].data).toEqual({
      status: 'REVOKED',
    });
  });
});

describe('ParticipationHistoryService', () => {
  const access = { check: vi.fn(async () => {}) };
  const history = () => new ParticipationHistoryService(access as never);

  it('hides only finished events', async () => {
    const get = vi.spyOn(EventDirectoryClient.prototype, 'get');
    get.mockResolvedValueOnce(eventDetail({ status: 'PUBLISHED' }));
    await expect(history().hide('e1', 'u1', 'B')).rejects.toMatchObject({
      code: 'EVENT_NOT_FINISHED',
    });
    get.mockResolvedValueOnce(eventDetail({ status: 'COMPLETED' }));
    await history().hide('e1', 'u1', 'B');
    expect(prisma.membership.updateMany.mock.calls[0]![0].data).toHaveProperty(
      'hiddenAt',
    );
  });

  it('lists finished events and filters private ones for others', async () => {
    const done = eventDetail({ status: 'COMPLETED' });
    const secret = eventDetail({
      status: 'COMPLETED',
      visibility: 'INVITE_ONLY',
    });
    const live = eventDetail({ status: 'PUBLISHED' });
    const byId = new Map(
      [done, secret, live].map((event) => [event.id, event]),
    );
    vi.spyOn(EventDirectoryClient.prototype, 'get').mockImplementation(
      async (id) => {
        if (id === 'gone')
          throw new ServiceRpcError('Missing.', 'NOT_FOUND', 404);
        return byId.get(id)!;
      },
    );
    prisma.membership.findMany.mockResolvedValue(
      [done.id, secret.id, live.id, 'gone'].map((eventId) =>
        membershipRow({ eventId }),
      ),
    );
    const own = await history().list('u1', 'u1', 'B', 0);
    expect(own.items.map((item) => item.eventId)).toEqual([done.id, secret.id]);
    const other = await history().list('u1', 'u2', 'B', 0);
    expect(other.items.map((item) => item.eventId)).toEqual([done.id]);
    expect(
      prisma.membership.findMany.mock.calls[1]![0].where.policy.visibility,
    ).toBe('PUBLIC');
  });

  it('reports history as unavailable when Events fails', async () => {
    vi.spyOn(EventDirectoryClient.prototype, 'get').mockRejectedValue(
      new Error('down'),
    );
    prisma.membership.findMany.mockResolvedValue([membershipRow()]);
    await expect(history().list('u1', 'u1', 'B', 0)).rejects.toMatchObject({
      statusCode: 503,
    });
  });
});
