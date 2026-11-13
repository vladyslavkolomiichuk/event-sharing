import { randomUUID } from 'node:crypto';
import { EVENT_TYPES, profileAvatarPath } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sqlText } from '../../../test/fake-prisma.js';
import { prisma, snapshot } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { UserProfileService } =
  await import('../src/services/UserProfileService.js');
const { FriendService } = await import('../src/services/FriendService.js');
const { UserProfileRepository } =
  await import('../src/repositories/UserProfileRepository.js');

beforeEach(() => prisma.reset());

describe('UserProfileService', () => {
  let repository: any;
  let friends: any;
  let service: InstanceType<typeof UserProfileService>;
  beforeEach(() => {
    repository = {
      findById: vi.fn(),
      findByUsername: vi.fn(),
      findManyByIds: vi.fn(async () => []),
      searchByUsername: vi.fn(),
      update: vi.fn(),
    };
    friends = {
      statuses: vi.fn(async () => new Map()),
      blocked: vi.fn(async () => new Set()),
    };
    service = new UserProfileService(repository, friends);
  });

  it('returns the private profile with preferences', async () => {
    const own = snapshot();
    repository.findById.mockResolvedValue(own);
    const profile = await service.getPrivate(own.profile.userId);
    expect(profile.phone).toBe('+380501234567');
    expect(profile.preferences.profileVisibility).toBe('PUBLIC');
    repository.findById.mockResolvedValue(null);
    await expect(service.getPrivate('x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('applies phone and city preferences to public profiles', async () => {
    const other = snapshot();
    repository.findById.mockResolvedValue(other);
    const profile = await service.getPublic(other.profile.userId, randomUUID());
    expect(profile.phone).toBeNull();
    expect(profile.city).toBe('Kyiv');
  });

  it('hides private, friends-only and blocked profiles', async () => {
    const actor = randomUUID();
    const hidden = snapshot({}, { profileVisibility: 'PRIVATE' });
    repository.findById.mockResolvedValue(hidden);
    await expect(
      service.getPublic(hidden.profile.userId, actor),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(
      (await service.getPublic(hidden.profile.userId, hidden.profile.userId))
        .userId,
    ).toBe(hidden.profile.userId);
    const friendsOnly = snapshot({}, { profileVisibility: 'FRIENDS' });
    repository.findById.mockResolvedValue(friendsOnly);
    friends.statuses.mockResolvedValue(
      new Map([[friendsOnly.profile.userId, 'FRIENDS']]),
    );
    expect(
      (await service.getPublic(friendsOnly.profile.userId, actor)).name,
    ).toBe('Iryna Melnyk');
    friends.blocked.mockResolvedValue(new Set([friendsOnly.profile.userId]));
    await expect(
      service.getPublic(friendsOnly.profile.userId, actor),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('finds profiles by username only when discoverable', async () => {
    const other = snapshot({}, { discoverableByUsername: false });
    repository.findByUsername.mockResolvedValue(other);
    await expect(
      service.getPublicByUsername('iryna', randomUUID()),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(
      (await service.getPublicByUsername('iryna', other.profile.userId))
        .username,
    ).toBe('iryna_melnyk');
    repository.findByUsername.mockResolvedValue(null);
    await expect(service.getPublicByUsername('x', 'y')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('checks history access', async () => {
    const other = snapshot({}, { showParticipationHistory: false });
    repository.findById.mockResolvedValue(other);
    expect(
      await service.canViewHistory(other.profile.userId, randomUUID()),
    ).toBe(false);
    expect(
      await service.canViewHistory(other.profile.userId, other.profile.userId),
    ).toBe(true);
    repository.findById.mockResolvedValue(snapshot());
    expect(await service.canViewHistory('u', randomUUID())).toBe(true);
    repository.findById.mockResolvedValue(null);
    expect(await service.canViewHistory('u', 'u')).toBe(false);
  });

  it('limits details of hidden profiles in bulk reads and search', async () => {
    const visible = snapshot();
    const hidden = snapshot({}, { profileVisibility: 'PRIVATE' });
    repository.findManyByIds.mockResolvedValue([visible, hidden]);
    const [first, second] = await service.getPublicMany(
      ['a', 'b'],
      randomUUID(),
    );
    expect(first!.bio).toBe('Hello');
    expect(second).toMatchObject({ bio: null, avatarUrl: null, city: null });
    repository.searchByUsername.mockResolvedValue({
      items: [visible],
      nextCursor: 'c',
    });
    friends.statuses.mockResolvedValue(
      new Map([[visible.profile.userId, 'SENT']]),
    );
    const result = await service.searchByUsername('iry', randomUUID());
    expect(result).toMatchObject({
      nextCursor: 'c',
      items: [{ relationship: 'SENT', bio: null }],
    });
  });

  it('accepts only the own internal avatar path', async () => {
    const userId = randomUUID();
    await expect(
      service.update(userId, { avatarUrl: profileAvatarPath(randomUUID()) }),
    ).rejects.toMatchObject({ code: 'INVALID_AVATAR' });
    repository.update.mockResolvedValue(snapshot({ userId }));
    expect(
      (await service.update(userId, { avatarUrl: profileAvatarPath(userId) }))
        .userId,
    ).toBe(userId);
    repository.update.mockResolvedValue(null);
    await expect(service.update(userId, { bio: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('UserProfileRepository', () => {
  it('reads one or many snapshots and requires preferences', async () => {
    const repository = new UserProfileRepository();
    const own = snapshot();
    prisma.userProfile.findUnique.mockResolvedValue(own.profile);
    prisma.userPreference.findUnique.mockResolvedValue(own.preferences);
    expect(await repository.findById(own.profile.userId)).toEqual(own);
    prisma.userPreference.findUnique.mockResolvedValue(null);
    await expect(repository.findById(own.profile.userId)).rejects.toThrow(
      'User preferences are missing.',
    );
    prisma.userProfile.findMany.mockResolvedValue([own.profile]);
    prisma.userPreference.findMany.mockResolvedValue([own.preferences]);
    expect(await repository.findManyByIds([own.profile.userId])).toEqual([own]);
  });

  it('searches discoverable users excluding blocks and self', async () => {
    const repository = new UserProfileRepository();
    const actor = randomUUID();
    const blocked = randomUUID();
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: actor, blockedId: blocked },
    ]);
    const found = snapshot();
    prisma.userProfile.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 21 }, () => ({ userId: found.profile.userId })),
      )
      .mockResolvedValueOnce([found.profile]);
    prisma.userPreference.findMany.mockResolvedValue([found.preferences]);
    const result = await repository.searchByUsername('iry', actor);
    expect(prisma.userProfile.findMany.mock.calls[0]![0].where.userId).toEqual({
      notIn: [blocked, actor],
    });
    expect(result.nextCursor).toBe('iryna_melnyk');
  });

  it('provisions a profile once', async () => {
    const repository = new UserProfileRepository();
    prisma.inboxEvent.createMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repository.provision(
        'e1',
        'u1',
        EVENT_TYPES.userRegistered,
        'Iryna',
        'iryna',
      ),
    ).toBe(false);
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    expect(
      await repository.provision(
        'e2',
        'u1',
        EVENT_TYPES.userRegistered,
        'Iryna',
        'iryna',
      ),
    ).toBe(true);
    expect(prisma.userProfile.createMany.mock.calls[0]![0].data).toEqual({
      userId: 'u1',
      name: 'Iryna',
      username: 'iryna',
    });
    expect(prisma.userPreference.createMany).toHaveBeenCalled();
    expect(
      await repository.provision('e3', 'u2', EVENT_TYPES.userRegistered),
    ).toBe(true);
    expect(prisma.userProfile.createMany).toHaveBeenCalledTimes(1);
  });

  it('applies name and username updates once', async () => {
    const repository = new UserProfileRepository();
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 1 });
    expect(
      await repository.updateName(
        'e1',
        'u1',
        'New',
        EVENT_TYPES.userNameUpdated,
      ),
    ).toBe(true);
    expect(prisma.userProfile.updateMany.mock.calls[0]![0].data).toEqual({
      name: 'New',
    });
    expect(
      await repository.updateUsername(
        'e2',
        'u1',
        'new_name',
        EVENT_TYPES.userUsernameUpdated,
      ),
    ).toBe(true);
    expect(prisma.userProfile.upsert.mock.calls[0]![0].create.name).toBe(
      'Member',
    );
    prisma.inboxEvent.createMany.mockResolvedValue({ count: 0 });
    expect(
      await repository.updateName(
        'e1',
        'u1',
        'New',
        EVENT_TYPES.userNameUpdated,
      ),
    ).toBe(false);
    expect(
      await repository.updateUsername(
        'e2',
        'u1',
        'n',
        EVENT_TYPES.userUsernameUpdated,
      ),
    ).toBe(false);
  });

  it('updates the profile and announces only a visible city', async () => {
    const repository = new UserProfileRepository();
    const own = snapshot({ version: 2 }, { showCity: false });
    prisma.userProfile.findUnique.mockResolvedValue({
      userId: own.profile.userId,
    });
    prisma.userProfile.update.mockResolvedValue(own.profile);
    prisma.userPreference.update.mockResolvedValue(own.preferences);
    await repository.update(own.profile.userId, {
      city: 'Lviv',
      preferences: { showCity: false, profileVisibility: 'FRIENDS' },
    });
    expect(prisma.userProfile.update.mock.calls[0]![0].data).toMatchObject({
      city: 'Lviv',
      version: { increment: 1 },
    });
    expect(prisma.userPreference.update.mock.calls[0]![0].data).toEqual({
      showCity: false,
      profileVisibility: 'FRIENDS',
    });
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data).toMatchObject({
      eventType: EVENT_TYPES.userProfileUpdated,
      payload: { profileVersion: 2, city: null },
    });
  });

  it('returns null for a missing profile update', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(null);
    expect(
      await new UserProfileRepository().update('u', { bio: 'x' }),
    ).toBeNull();
  });
});

describe('FriendService', () => {
  const service = () => new FriendService();
  const actor = '00000000-0000-4000-8000-0000000000a1';
  const other = '00000000-0000-4000-8000-0000000000b2';
  const person = { userId: other, name: 'Olena', username: 'olena' };

  it('searches friends with paging and escapes nothing into SQL', async () => {
    prisma.$queryRaw.mockResolvedValue(
      Array.from({ length: 21 }, () => person),
    );
    const result = await service().search(actor, '@Olena', 'username', 1);
    expect(result.items).toHaveLength(20);
    expect(result.nextPage).toBe(2);
    const query = prisma.$queryRaw.mock.calls[0]!;
    expect(sqlText({ strings: query[0] })).toContain('lower(?)');
    expect(query).toContain('olena');
  });

  it('computes blocked users and relationship statuses', async () => {
    prisma.userBlock.findMany.mockResolvedValue([
      { blockerId: other, blockedId: actor },
    ]);
    expect([...(await service().blocked(actor, [other]))]).toEqual([other]);
    prisma.friendship.findMany.mockResolvedValue([
      { userIdA: actor, userIdB: 'f1' },
    ]);
    prisma.friendRequest.findMany.mockResolvedValue([
      { senderId: actor, recipientId: 's1' },
      { senderId: 'r1', recipientId: actor },
    ]);
    expect(Object.fromEntries(await service().statuses(actor, []))).toEqual({
      f1: 'FRIENDS',
      s1: 'SENT',
      r1: 'RECEIVED',
    });
  });

  it('resolves invitation targets by privacy settings', async () => {
    prisma.userProfile.findUnique.mockResolvedValueOnce(null);
    await expect(service().invitationTarget(actor, 'x')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
    prisma.userProfile.findUnique.mockResolvedValue({
      ...person,
      userId: actor,
    });
    await expect(service().invitationTarget(actor, 'me')).rejects.toThrow(
      'You cannot invite yourself.',
    );
    prisma.userProfile.findUnique.mockResolvedValue(person);
    prisma.userBlock.count.mockResolvedValue(0);
    prisma.userPreference.findUnique.mockResolvedValue({
      discoverableByUsername: true,
      allowInvitesFromStrangers: false,
    });
    await expect(
      service().invitationTarget(actor, 'olena'),
    ).rejects.toMatchObject({
      code: 'INVITATION_UNAVAILABLE',
    });
    prisma.friendship.findUnique.mockResolvedValue({ userIdA: actor });
    expect(await service().invitationTarget(actor, 'olena')).toEqual(person);
  });

  it('sends a friend request and queues a notification', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(person);
    prisma.userPreference.findUnique.mockResolvedValue({
      allowFriendRequests: true,
      discoverableByUsername: true,
    });
    prisma.userBlock.count.mockResolvedValue(0);
    prisma.userProfile.findUniqueOrThrow.mockResolvedValue({
      name: 'Iryna',
      username: 'iryna',
    });
    await service().request(actor, 'olena');
    expect(prisma.friendRequest.upsert.mock.calls[0]![0].create).toEqual({
      senderId: actor,
      recipientId: other,
    });
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data).toMatchObject({
      eventType: EVENT_TYPES.friendRequested,
      payload: { actorId: actor, recipientId: other, actorUsername: 'iryna' },
    });
  });

  it('refuses requests to blocked, closed or existing contacts', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(person);
    prisma.userProfile.findUniqueOrThrow.mockResolvedValue({
      name: 'I',
      username: 'iryna',
    });
    prisma.userPreference.findUnique.mockResolvedValue({
      allowFriendRequests: false,
      discoverableByUsername: true,
    });
    await expect(service().request(actor, 'olena')).rejects.toMatchObject({
      code: 'FRIEND_REQUESTS_UNAVAILABLE',
    });
    prisma.userPreference.findUnique.mockResolvedValue({
      allowFriendRequests: true,
      discoverableByUsername: true,
    });
    prisma.userBlock.count.mockResolvedValue(0);
    prisma.friendship.findUnique.mockResolvedValue({});
    await expect(service().request(actor, 'olena')).rejects.toMatchObject({
      code: 'FRIEND_ACTION_INVALID',
    });
    prisma.userProfile.findUnique.mockResolvedValue({
      ...person,
      userId: actor,
    });
    await expect(service().request(actor, 'me')).rejects.toThrow(
      'You cannot add yourself.',
    );
  });

  it('accepts, rejects and cancels requests by the right side', async () => {
    const request = {
      id: 'r1',
      senderId: other,
      recipientId: actor,
      status: 'PENDING',
    };
    prisma.friendRequest.findUnique.mockResolvedValue(request);
    prisma.friendRequest.findUniqueOrThrow.mockResolvedValue(request);
    prisma.userBlock.count.mockResolvedValue(0);
    prisma.userProfile.findUniqueOrThrow.mockResolvedValue({
      name: 'I',
      username: 'iryna',
    });
    await service().decide(actor, 'r1', 'ACCEPTED');
    expect(prisma.friendship.create).toHaveBeenCalledWith({
      data: { userIdA: actor, userIdB: other },
    });
    expect(prisma.outboxEvent.create.mock.calls[0]![0].data.eventType).toBe(
      EVENT_TYPES.friendAccepted,
    );
    await expect(
      service().decide(actor, 'r1', 'CANCELLED'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    prisma.friendRequest.findUniqueOrThrow.mockResolvedValue({
      ...request,
      status: 'ACCEPTED',
    });
    await expect(service().decide(actor, 'r1', 'REJECTED')).rejects.toThrow(
      'Request is no longer pending.',
    );
    prisma.friendRequest.findUnique.mockResolvedValue(null);
    await expect(
      service().decide(actor, 'r1', 'REJECTED'),
    ).rejects.toMatchObject({
      code: 'REQUEST_NOT_FOUND',
    });
  });

  it('removes friends, blocks and unblocks', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(person);
    await service().remove(actor, 'olena');
    expect(prisma.friendship.deleteMany).toHaveBeenCalledWith({
      where: { userIdA: actor, userIdB: other },
    });
    await service().block(actor, 'olena');
    expect(prisma.userBlock.createMany.mock.calls[0]![0].data).toEqual({
      blockerId: actor,
      blockedId: other,
    });
    await service().unblock(actor, 'olena');
    expect(prisma.userBlock.deleteMany).toHaveBeenCalled();
    prisma.userProfile.findUnique.mockResolvedValue({
      ...person,
      userId: actor,
    });
    await expect(service().block(actor, 'me')).rejects.toThrow(
      'You cannot block yourself.',
    );
    prisma.userProfile.findUnique.mockResolvedValue(null);
    await expect(service().remove(actor, 'x')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service().unblock(actor, 'x')).resolves.toBeUndefined();
  });

  it('lists friends, requests and blocks with avatar privacy', async () => {
    prisma.friendship.findMany.mockResolvedValue([
      { userIdA: actor, userIdB: 'f1' },
    ]);
    prisma.friendRequest.findMany
      .mockResolvedValueOnce([{ id: 'r', senderId: 'p1', recipientId: actor }])
      .mockResolvedValueOnce([]);
    prisma.userBlock.findMany.mockResolvedValue([]);
    prisma.userProfile.findMany.mockResolvedValue([
      { userId: 'f1', username: 'f', name: 'F', avatarUrl: 'a' },
      { userId: 'p1', username: 'p', name: 'P', avatarUrl: 'b' },
    ]);
    prisma.userPreference.findMany.mockResolvedValue([
      { userId: 'f1', profileVisibility: 'FRIENDS' },
      { userId: 'p1', profileVisibility: 'FRIENDS' },
    ]);
    const result = await service().list(actor, 0);
    expect(result.friends[0]!.avatarUrl).toBe('a');
    expect(result.received[0]!.person!.avatarUrl).toBeNull();
    expect(result.nextPage).toBeNull();
  });
});
