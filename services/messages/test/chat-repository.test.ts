import { randomUUID } from 'node:crypto';
import { EVENT_TYPES } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventDetail } from '../../../test/fixtures.js';
import { messageRow, prisma, roomRow } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));

const { ChatRepository } =
  await import('../src/repositories/ChatRepository.js');
const { Prisma } = await import('../src/generated/prisma/client.js');

const repository = () => new ChatRepository();
const outbox = () =>
  prisma.outboxEvent.create.mock.calls.map((call: any[]) => call[0].data);

beforeEach(() => prisma.reset());

describe('queries', () => {
  it('collects events a user touched', async () => {
    prisma.eventProjection.findMany.mockResolvedValue([{ id: 'e1' }]);
    prisma.membershipProjection.findMany.mockResolvedValue([{ eventId: 'e2' }]);
    prisma.chatMessage.findMany.mockResolvedValue([{ eventId: 'e1' }]);
    expect(await repository().eventsWithUser('u1')).toEqual(['e1', 'e2']);
  });

  it('lists room participants including the organizer', async () => {
    prisma.eventProjection.findUnique.mockResolvedValue({ organizerId: 'o' });
    prisma.chatRoom.findUnique.mockResolvedValue({
      access: 'SELECTED_MEMBERS',
    });
    prisma.chatRoomMember.findMany.mockResolvedValue([
      { userId: 'a' },
      { userId: 'o' },
    ]);
    expect(await repository().participants('e1', 'r1')).toEqual(['o', 'a']);
    prisma.membershipProjection.findMany.mockResolvedValue([{ userId: 'b' }]);
    expect(await repository().participants('e1')).toEqual(['o', 'b']);
  });

  it('creates the General room when projecting a chat event', async () => {
    const event = eventDetail({ status: 'COMPLETED' });
    await repository().ensureEvent(event);
    expect(prisma.chatRoom.createMany.mock.calls[0]![0].data).toMatchObject({
      name: 'General',
      status: 'READ_ONLY',
    });
    await repository().ensureEvent(eventDetail({ chatEnabled: false }));
    expect(prisma.chatRoom.createMany).toHaveBeenCalledTimes(1);
  });

  it('filters rooms for non-owners', async () => {
    await repository().rooms('e1', 'u1', false);
    expect(prisma.chatRoom.findMany.mock.calls[0]![0].where.OR).toHaveLength(2);
    await repository().rooms('e1', 'u1', true);
    expect(prisma.chatRoom.findMany.mock.calls[1]![0].where).toEqual({
      eventId: 'e1',
    });
  });

  it('counts unread messages after the read marker', async () => {
    const lastReadAt = new Date();
    prisma.chatReadState.findUnique.mockResolvedValue({
      lastReadAt,
      lastReadMessageId: 'm',
    });
    await repository().unreadCount('r1', 'u1', new Date(0));
    const where = prisma.chatMessage.count.mock.calls[0]![0].where;
    expect(where.OR).toEqual([
      { createdAt: { gt: lastReadAt } },
      { createdAt: lastReadAt, id: { gt: 'm' } },
    ]);
    expect(where.createdAt).toEqual({ gte: new Date(0) });
  });

  it('pages messages before a cursor and rejects unknown cursors', async () => {
    const cursor = { id: 'm5', createdAt: new Date() };
    prisma.chatMessage.findFirst.mockResolvedValueOnce(cursor);
    await repository().messages('r1', 'm5');
    expect(prisma.chatMessage.findMany.mock.calls[0]![0]).toMatchObject({
      take: 51,
    });
    prisma.chatMessage.findFirst.mockResolvedValueOnce(null);
    expect(await repository().messages('r1', 'missing')).toBeNull();
  });

  it('reads simple projections', async () => {
    const repo = repository();
    await repo.isDeletedUser('u');
    await repo.membership('e', 'u');
    await repo.roomMember('r', 'u');
    await repo.roomMembers('r');
    await repo.latestMessage('r', new Date(0));
    await repo.setNotificationPreference('r', 'u', false);
    await repo.userNames(['u']);
    await repo.overview('u');
    expect(
      prisma.chatNotificationPreference.upsert.mock.calls[0]![0].update,
    ).toEqual({ enabled: false });
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });
});

describe('markRead', () => {
  it('moves the read marker forward only', async () => {
    const message = messageRow();
    prisma.chatMessage.findFirst.mockResolvedValue(message);
    prisma.chatReadState.findUnique.mockResolvedValue(null);
    await repository().markRead('r1', 'u1', message.id);
    expect(
      prisma.chatReadState.upsert.mock.calls[0]![0].create.lastReadMessageId,
    ).toBe(message.id);
    const newer = {
      lastReadAt: new Date(message.createdAt.getTime() + 1),
      lastReadMessageId: 'x',
    };
    prisma.chatReadState.findUnique.mockResolvedValue(newer);
    expect(await repository().markRead('r1', 'u1', message.id)).toBe(newer);
    expect(prisma.chatReadState.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown messages and deleted users', async () => {
    prisma.chatMessage.findFirst.mockResolvedValue(null);
    await expect(repository().markRead('r1', 'u1', 'm')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    prisma.deletedChatUser.findFirst.mockResolvedValue({ userId: 'u1' });
    await expect(repository().markRead('r1', 'u1', 'm')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });
});

describe('rooms', () => {
  const event = randomUUID();
  const a = randomUUID();
  const b = randomUUID();
  const p = randomUUID();
  const actor = randomUUID();

  it('creates a room and announces active members', async () => {
    const room = roomRow({ eventId: event });
    prisma.chatRoom.count.mockResolvedValue(1);
    prisma.chatRoom.create.mockResolvedValue(room);
    prisma.chatRoomMember.findMany.mockResolvedValue([{ userId: a }]);
    await repository().createRoom(
      event,
      'Backstage',
      actor,
      'SELECTED_MEMBERS',
      [
        { userId: a, active: true },
        { userId: p, active: false },
      ],
    );
    const members =
      prisma.chatRoom.create.mock.calls[0]![0].data.members.create;
    expect(members.map((member: any) => member.status)).toEqual([
      'ACTIVE',
      'PENDING',
    ]);
    expect(outbox()).toEqual([
      expect.objectContaining({
        eventType: EVENT_TYPES.chatMembershipChanged,
        payload: expect.objectContaining({ recipientId: a, change: 'ADDED' }),
      }),
    ]);
  });

  it('refuses duplicate names and more than twenty rooms', async () => {
    prisma.chatRoom.findFirst.mockResolvedValueOnce({ id: 'x' });
    await expect(
      repository().createRoom(event, 'A', 'u', 'ALL_PARTICIPANTS', []),
    ).rejects.toMatchObject({ code: 'CHAT_ROOM_EXISTS' });
    prisma.chatRoom.count.mockResolvedValue(20);
    expect(
      await repository().createRoom(event, 'A', 'u', 'ALL_PARTICIPANTS', []),
    ).toBeNull();
  });

  it('locks access after the first message and maps name clashes', async () => {
    const room = roomRow();
    prisma.chatRoom.findUnique.mockResolvedValue(room);
    prisma.chatMessage.count.mockResolvedValue(1);
    await expect(
      repository().updateRoom(room.id, undefined, 'ALL_PARTICIPANTS'),
    ).rejects.toMatchObject({
      code: 'ROOM_ACCESS_LOCKED',
    });
    prisma.chatRoom.findFirst.mockResolvedValueOnce({ id: 'dup' });
    await expect(
      repository().updateRoom(room.id, 'Other'),
    ).rejects.toMatchObject({
      code: 'CHAT_ROOM_EXISTS',
    });
    prisma.chatRoom.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'x',
      }),
    );
    await expect(
      repository().updateRoom(room.id, 'Third'),
    ).rejects.toMatchObject({
      code: 'CHAT_ROOM_EXISTS',
    });
    prisma.chatRoom.findUnique.mockResolvedValue({
      ...room,
      archivedAt: new Date(),
    });
    await expect(repository().updateRoom(room.id, 'X')).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('adds new or removed members and skips current ones', async () => {
    const room = roomRow();
    prisma.chatRoom.findUnique.mockResolvedValue(room);
    prisma.chatRoomMember.findUnique
      .mockResolvedValueOnce({ status: 'ACTIVE' })
      .mockResolvedValueOnce({ status: 'REMOVED' });
    prisma.chatRoomMember.findMany.mockResolvedValue([]);
    await repository().addMembers(room.id, actor, [
      { userId: a, active: true },
      { userId: b, active: true },
    ]);
    expect(prisma.chatRoomMember.upsert).toHaveBeenCalledTimes(1);
    expect(
      prisma.chatRoomMember.upsert.mock.calls[0]![0].update.removedAt,
    ).toBeNull();
    expect(outbox()).toHaveLength(1);
  });

  it('removes a member and archives rooms', async () => {
    const room = roomRow();
    prisma.chatRoom.findUnique.mockResolvedValue(room);
    prisma.chatRoomMember.updateMany.mockResolvedValue({ count: 1 });
    prisma.chatRoomMember.findMany.mockResolvedValue([]);
    expect(await repository().removeMember(room.id, a, actor)).toBe(true);
    expect(outbox()[0]!.payload).toMatchObject({
      change: 'REMOVED',
      recipientId: a,
    });
    prisma.chatRoom.updateMany.mockResolvedValue({ count: 0 });
    prisma.chatRoom.findUniqueOrThrow.mockResolvedValue(room);
    expect(await repository().archiveRoom(room.id)).toEqual({
      room,
      changed: false,
    });
  });
});

describe('send', () => {
  const eventId = randomUUID();
  const organizer = randomUUID();
  const sender = randomUUID();
  const roomId = randomUUID();
  const live = () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        eventId,
        status: 'ACTIVE',
        access: 'ALL_PARTICIPANTS',
        name: 'General',
      },
    ]);
    prisma.eventProjection.findUnique.mockResolvedValue({
      organizerId: organizer,
      chatEnabled: true,
      status: 'PUBLISHED',
    });
    prisma.chatMessage.count.mockResolvedValue(0);
    prisma.chatMessage.create.mockImplementation(async ({ data }: any) => ({
      id: randomUUID(),
      createdAt: new Date(),
      ...data,
    }));
  };

  it('stores the message and splits toast recipients by mute settings', async () => {
    live();
    const muted = randomUUID();
    const listener = randomUUID();
    prisma.membershipProjection.findMany.mockResolvedValue([
      { userId: muted },
      { userId: listener },
    ]);
    prisma.chatNotificationPreference.findMany.mockResolvedValue([
      { userId: muted },
    ]);
    const result = await repository().send(
      roomId,
      eventId,
      sender,
      'Hi',
      randomUUID(),
    );
    expect(result.created).toBe(true);
    expect(result.recipients.sort()).toEqual(
      [muted, listener, organizer, sender].sort(),
    );
    expect(result.toastRecipients.sort()).toEqual([listener, organizer].sort());
    expect(outbox()[0]).toMatchObject({
      eventType: EVENT_TYPES.chatMessageCreated,
    });
  });

  it('returns the earlier message for a retried client id', async () => {
    live();
    const earlier = messageRow({ roomId, body: 'Hi' });
    prisma.chatMessage.findUnique.mockResolvedValue(earlier);
    expect(
      await repository().send(roomId, eventId, sender, 'Hi', randomUUID()),
    ).toEqual({
      message: earlier,
      created: false,
      recipients: [],
      toastRecipients: [],
    });
    await expect(
      repository().send(roomId, eventId, sender, 'Different', randomUUID()),
    ).rejects.toMatchObject({ code: 'MESSAGE_CONFLICT' });
  });

  it('limits senders to thirty messages a minute', async () => {
    live();
    prisma.chatMessage.count.mockResolvedValue(30);
    await expect(
      repository().send(roomId, eventId, sender, 'Hi', randomUUID()),
    ).rejects.toMatchObject({ code: 'MESSAGE_RATE_LIMITED' });
  });

  it('rejects closed chats, foreign rooms and outsiders', async () => {
    live();
    prisma.eventProjection.findUnique.mockResolvedValue({
      chatEnabled: true,
      status: 'COMPLETED',
    });
    await expect(
      repository().send(roomId, eventId, sender, 'Hi', randomUUID()),
    ).rejects.toMatchObject({
      code: 'CHAT_UNAVAILABLE',
    });
    prisma.$queryRaw.mockResolvedValue([
      { eventId: randomUUID(), status: 'ACTIVE' },
    ]);
    await expect(
      repository().send(roomId, eventId, sender, 'Hi', randomUUID()),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    live();
    prisma.$queryRaw.mockResolvedValue([
      { eventId, status: 'ACTIVE', access: 'SELECTED_MEMBERS', name: 'B' },
    ]);
    prisma.chatRoomMember.findUnique.mockResolvedValue({ status: 'REMOVED' });
    await expect(
      repository().send(roomId, eventId, sender, 'Hi', randomUUID()),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });
});
