import { randomUUID } from 'node:crypto';
import { ANONYMOUS_USER_ID, EVENT_TYPES } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { envelope, eventDetail } from '../../../test/fixtures.js';
import { prisma } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { NotificationEventService } =
  await import('../src/services/NotificationEventService.js');

const admin = randomUUID();
const organizer = randomUUID();
const member = randomUUID();

let projections: any;
let notifications: any;
let changed: ReturnType<typeof vi.fn>;
let service: InstanceType<typeof NotificationEventService>;

const created = () =>
  notifications.createMany.mock.calls.flatMap(
    (call: any[]) => call[1] as any[],
  );
const snapshot = (overrides = {}) => {
  const {
    moderationReason: _m,
    policyError: _p,
    pendingStatus: _s,
    pendingRegistrationStatus: _r,
    pendingParticipantLimit: _l,
    ...detail
  } = eventDetail({ organizerId: organizer, ...overrides });
  return detail;
};
const fromEvents = (payload: unknown, type = EVENT_TYPES.eventUpdated) =>
  envelope(type, 'events', payload);

beforeEach(() => {
  prisma.reset();
  prisma.pendingSnapshotEvent.findMany.mockResolvedValue([]);
  prisma.pendingMembershipEvent.findMany.mockResolvedValue([]);
  projections = {
    accept: vi.fn(async () => true),
    upsertUser: vi.fn(),
    updateRole: vi.fn(),
    updateName: vi.fn(),
    updatePreference: vi.fn(),
    getAdmins: vi.fn(async () => [{ id: admin }, { id: organizer }]),
    recordOrganizerRequest: vi.fn(),
    resolveOrganizerRequest: vi.fn(),
    getOrganizerRequest: vi.fn(async () => null),
    listOrganizerRequests: vi.fn(async () => []),
    listPendingModeration: vi.fn(async () => []),
    getUser: vi.fn(async (_tx: unknown, id: string) => ({
      id,
      name: 'Olena',
      notificationsEnabled: true,
    })),
    getEvent: vi.fn(async () => null),
    upsertEvent: vi.fn(),
    updateMembership: vi.fn(),
    getActiveMembers: vi.fn(async () => [
      { userId: member },
      { userId: organizer },
    ]),
  };
  notifications = {
    createMany: vi.fn(async (_tx: unknown, items: unknown[]) => items.length),
    deleteModerationForUser: vi.fn(),
    deleteModerationForEvent: vi.fn(),
    deleteRoleRequestsForUser: vi.fn(),
    deleteRoleRequestNotifications: vi.fn(),
  };
  changed = vi.fn();
  service = new NotificationEventService(projections, notifications, changed);
});

describe('identity events', () => {
  it('stores users and backfills work for new admins', async () => {
    projections.listPendingModeration.mockResolvedValue([
      {
        id: 'e1',
        organizerId: organizer,
        title: 'Jazz',
        lastSourceEventId: 's1',
      },
    ]);
    projections.listOrganizerRequests.mockResolvedValue([
      {
        id: 'r1',
        requesterId: member,
        requesterName: 'Olena',
        sourceEventId: 's2',
      },
    ]);
    const event = envelope(EVENT_TYPES.userRegistered, 'auth', {
      userId: admin,
      role: 'ADMIN',
    });
    expect(await service.apply(event)).toBe('processed');
    expect(projections.upsertUser).toHaveBeenCalledWith(
      expect.anything(),
      admin,
      'ADMIN',
      'User',
    );
    expect(created().map((item: any) => item.type)).toEqual([
      'EVENT_MODERATION',
      'ORGANIZER_REQUEST',
    ]);
    expect(changed).toHaveBeenCalledWith([admin]);
  });

  it('removes admin notifications after a demotion', async () => {
    await service.apply(
      envelope(EVENT_TYPES.userRoleChanged, 'auth', {
        userId: admin,
        role: 'USER',
      }),
    );
    expect(notifications.deleteModerationForUser).toHaveBeenCalledWith(
      expect.anything(),
      admin,
    );
    expect(notifications.deleteRoleRequestsForUser).toHaveBeenCalled();
    expect(changed).toHaveBeenCalledWith([admin]);
  });

  it('notifies other admins about organizer requests', async () => {
    const requestId = randomUUID();
    await service.apply(
      envelope(EVENT_TYPES.organizerRequestSubmitted, 'auth', {
        requestId,
        userId: organizer,
        name: 'Iryna',
      }),
    );
    expect(created()).toEqual([
      expect.objectContaining({
        recipientId: admin,
        type: 'ORGANIZER_REQUEST',
        body: 'Iryna requested organizer access.',
      }),
    ]);
  });

  it('tells the requester about the decision and clears admin items', async () => {
    projections.getOrganizerRequest.mockResolvedValue({ sourceEventId: 's1' });
    await service.apply(
      envelope(EVENT_TYPES.organizerRequestResolved, 'auth', {
        requestId: randomUUID(),
        userId: member,
        decidedById: admin,
        status: 'REJECTED',
        decisionReason: 'Add more details.',
      }),
    );
    expect(notifications.deleteRoleRequestNotifications).toHaveBeenCalledWith(
      expect.anything(),
      's1',
    );
    expect(created()[0]).toMatchObject({
      recipientId: member,
      title: 'Organizer access declined',
      body: 'Add more details.',
      href: '/',
    });
  });

  it('updates names and notification preferences', async () => {
    await service.apply(
      envelope(EVENT_TYPES.userNameUpdated, 'auth', {
        userId: member,
        name: 'New',
      }),
    );
    expect(projections.updateName).toHaveBeenCalledWith(
      expect.anything(),
      member,
      'New',
    );
    await service.apply(
      envelope(EVENT_TYPES.userProfileUpdated, 'users', {
        userId: member,
        profileVersion: 2,
        city: null,
        notificationsEnabled: false,
      }),
    );
    expect(projections.updatePreference).toHaveBeenCalledWith(
      expect.anything(),
      member,
      false,
    );
  });

  it('reports duplicates from the inbox', async () => {
    projections.accept.mockResolvedValue(false);
    expect(
      await service.apply(
        envelope(EVENT_TYPES.userNameUpdated, 'auth', {
          userId: member,
          name: 'X',
        }),
      ),
    ).toBe('duplicate');
  });
});

describe('social events', () => {
  it('notifies friend requests, acceptances and invitations', async () => {
    const friend = {
      actorId: member,
      recipientId: organizer,
      actorName: 'Olena',
      actorUsername: 'olena',
    };
    await service.apply(envelope(EVENT_TYPES.friendRequested, 'users', friend));
    await service.apply(envelope(EVENT_TYPES.friendAccepted, 'users', friend));
    await service.apply(
      envelope(EVENT_TYPES.invitationSent, 'participation', {
        eventId: randomUUID(),
        recipientId: member,
        organizerId: organizer,
        title: 'Jazz',
      }),
    );
    expect(created().map((item: any) => [item.type, item.href])).toEqual([
      ['FRIEND_REQUEST', '/friends/received'],
      ['FRIEND_ACCEPTED', '/friends'],
      ['EVENT_INVITATION', '/invitations'],
    ]);
  });

  it('respects muted recipients for chat group changes', async () => {
    const payload = {
      eventId: randomUUID(),
      roomId: randomUUID(),
      roomName: 'Backstage',
      recipientId: member,
      subjectId: member,
      actorId: organizer,
      change: 'REMOVED',
    };
    await service.apply(
      envelope(EVENT_TYPES.chatMembershipChanged, 'messages', payload),
    );
    expect(created()[0]).toMatchObject({
      body: 'You were removed from Backstage.',
      href: `/events/${payload.eventId}`,
    });
    projections.getUser.mockResolvedValue({ notificationsEnabled: false });
    notifications.createMany.mockClear();
    await service.apply(
      envelope(EVENT_TYPES.chatMembershipChanged, 'messages', payload),
    );
    expect(notifications.createMany).not.toHaveBeenCalled();
  });
});

describe('event snapshots', () => {
  it('asks admins to moderate submitted events', async () => {
    await service.apply(fromEvents(snapshot({ status: 'MODERATION' })));
    expect(created()).toEqual([
      expect.objectContaining({ recipientId: admin, type: 'EVENT_MODERATION' }),
    ]);
  });

  it('clears moderation items once reviewed and tells the organizer', async () => {
    projections.getEvent.mockResolvedValue({
      status: 'MODERATION',
      version: 1,
    });
    const payload = snapshot({ status: 'REJECTED', version: 2 });
    await service.apply(fromEvents(payload));
    expect(notifications.deleteModerationForEvent).toHaveBeenCalledWith(
      expect.anything(),
      payload.id,
    );
    expect(created()[0]).toMatchObject({
      recipientId: organizer,
      type: 'EVENT_REJECTED',
    });
  });

  it('notifies members about changed details and cancellation', async () => {
    await service.apply(
      fromEvents({
        ...snapshot({ status: 'PUBLISHED' }),
        detailsChanged: true,
      }),
    );
    expect(created()).toEqual([
      expect.objectContaining({ recipientId: member, type: 'EVENT_UPDATED' }),
    ]);
    notifications.createMany.mockClear();
    await service.apply(
      fromEvents(snapshot({ status: 'CANCELLED' }), EVENT_TYPES.eventCancelled),
    );
    expect(created().map((item: any) => item.recipientId)).toEqual([
      member,
      organizer,
    ]);
  });

  it('notifies completed participants once each', async () => {
    await service.apply(
      fromEvents({
        ...snapshot({ status: 'COMPLETED' }),
        completedParticipantIds: [member, organizer],
      }),
    );
    expect(created().map((item: any) => item.recipientId)).toEqual([
      organizer,
      member,
    ]);
  });

  it('skips stale versions and unchanged statuses', async () => {
    projections.getEvent.mockResolvedValue({ status: 'PUBLISHED', version: 5 });
    expect(await service.apply(fromEvents(snapshot({ version: 3 })))).toBe(
      'ignored',
    );
    projections.getEvent.mockResolvedValue({ status: 'PUBLISHED', version: 1 });
    expect(
      await service.apply(
        fromEvents(snapshot({ status: 'PUBLISHED', version: 2 })),
      ),
    ).toBe('processed');
    expect(notifications.createMany).not.toHaveBeenCalled();
  });

  it('never notifies the anonymous user', async () => {
    projections.getActiveMembers.mockResolvedValue([
      { userId: ANONYMOUS_USER_ID },
    ]);
    notifications.createMany.mockImplementation(
      async (_tx: unknown, items: unknown[]) => items.length,
    );
    await service.apply(fromEvents(snapshot({ status: 'CANCELLED' })));
    expect(created()).toEqual([]);
  });

  it('parks snapshots until their predecessor is known', async () => {
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    const event = fromEvents({
      ...snapshot(),
      previousSnapshotEventId: randomUUID(),
    });
    expect(await service.apply(event)).toBe('pending');
    expect(prisma.pendingSnapshotEvent.createMany).toHaveBeenCalled();
  });
});

describe('membership events', () => {
  const ready = () => {
    prisma.eventProjection.findUnique.mockResolvedValue({
      organizerId: organizer,
      status: 'PUBLISHED',
    });
    prisma.userProjection.findUnique.mockResolvedValue({ id: member });
  };
  const joined = (payload = {}) =>
    envelope(EVENT_TYPES.userJoined, 'participation', {
      eventId: randomUUID(),
      userId: member,
      ...payload,
    });

  it('waits until the event and users are projected', async () => {
    prisma.eventProjection.findUnique.mockResolvedValue(null);
    expect(await service.apply(joined())).toBe('pending');
    expect(prisma.pendingMembershipEvent.createMany).toHaveBeenCalled();
  });

  it('tells the organizer about a new participant', async () => {
    ready();
    projections.getEvent.mockResolvedValue({
      organizerId: organizer,
      title: 'Jazz',
      status: 'PUBLISHED',
    });
    expect(await service.apply(joined())).toBe('processed');
    expect(projections.updateMembership).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      member,
      true,
      undefined,
    );
    expect(created()[0]).toMatchObject({
      recipientId: organizer,
      type: 'PARTICIPANT_JOINED',
      body: 'Olena joined Jazz.',
    });
  });

  it('tells late joiners that the event is cancelled', async () => {
    ready();
    projections.getEvent.mockResolvedValue({
      organizerId: organizer,
      title: 'Jazz',
      status: 'CANCELLED',
      lastSourceEventId: 's9',
    });
    await service.apply(joined());
    expect(created()[0]).toMatchObject({
      recipientId: member,
      type: 'EVENT_CANCELLED',
      sourceEventId: 's9',
    });
  });

  it('ignores duplicates and out-of-order versions', async () => {
    prisma.inboxEvent.findUnique.mockResolvedValueOnce({ id: 'x' });
    expect(await service.apply(joined())).toBe('duplicate');
    ready();
    prisma.membershipProjection.findUnique.mockResolvedValue({
      lastMembershipEventId: 'other',
    });
    expect(
      await service.apply(joined({ previousMembershipEventId: null })),
    ).toBe('ignored');
  });

  it('recovers parked snapshots and memberships', async () => {
    prisma.$queryRaw.mockResolvedValueOnce([]);
    await service.recoverPending();
    expect(prisma.pendingMembershipEvent.findMany).toHaveBeenCalled();
  });
});
