import { randomUUID } from 'node:crypto';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventDetail } from '../../../test/fixtures.js';
import { messageRow, roomRow, serviceBus } from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));

const { ChatService } = await import('../src/services/ChatService.js');
const { isChatAvailable, isChatReadable } =
  await import('../src/domain/ChatAvailability.js');
const { ParticipationMemberClient } =
  await import('../src/clients/ParticipationMemberClient.js');

const owner = randomUUID();
const member = randomUUID();
const eventId = randomUUID();
const joinedAt = new Date('2026-11-01T09:00:00.000Z');

let repository: any;
let participation: any;
let events: any;
let onChanged: ReturnType<typeof vi.fn>;
let service: InstanceType<typeof ChatService>;
let event: any;

beforeEach(() => {
  event = {
    eventId,
    organizerId: owner,
    chatEnabled: true,
    status: 'PUBLISHED',
    title: 'Jazz',
  };
  repository = {
    isDeletedUser: vi.fn(async () => false),
    event: vi.fn(async () => event),
    participants: vi.fn(async () => [owner, member]),
    room: vi.fn(),
    roomMember: vi.fn(),
    rooms: vi.fn(async () => []),
    unreadCount: vi.fn(async () => 0),
    latestMessage: vi.fn(async () => null),
    userNames: vi.fn(async () => []),
    overview: vi.fn(async () => []),
    roomMembers: vi.fn(async () => []),
    markRead: vi.fn(),
    ensureEvent: vi.fn(),
    createRoom: vi.fn(),
    updateRoom: vi.fn(),
    addMembers: vi.fn(),
    removeMember: vi.fn(),
    archiveRoom: vi.fn(),
    messages: vi.fn(),
    send: vi.fn(),
    setNotificationPreference: vi.fn(),
  };
  participation = { isJoined: vi.fn(async () => joinedAt) };
  events = {
    get: vi.fn(async () => eventDetail({ id: eventId, organizerId: owner })),
  };
  onChanged = vi.fn();
  service = new ChatService(repository, onChanged, participation, events);
});

describe('chat availability', () => {
  it('allows writing only in live events and reading after them', () => {
    expect(isChatAvailable('ONGOING')).toBe(true);
    expect(isChatAvailable('COMPLETED')).toBe(false);
    expect(isChatReadable('ARCHIVED')).toBe(true);
    expect(isChatReadable('DRAFT')).toBe(false);
  });
});

describe('ParticipationMemberClient', () => {
  it('returns the join date only for joined members', async () => {
    serviceBus.call.mockResolvedValueOnce({
      status: 'JOINED',
      joinedAt: joinedAt.toISOString(),
    });
    expect(
      await new ParticipationMemberClient().isJoined(eventId, member, 'B'),
    ).toEqual(joinedAt);
    expect(serviceBus.call).toHaveBeenCalledWith(
      'participation',
      RPC_OPERATIONS.membership,
      { eventId, userId: member },
      'B',
    );
    serviceBus.call.mockResolvedValueOnce({ status: 'LEFT', joinedAt: null });
    expect(
      await new ParticipationMemberClient().isJoined(eventId, member, 'B'),
    ).toBeNull();
  });
});

describe('access rules', () => {
  it('rejects deleted users, missing events and disabled chats', async () => {
    repository.isDeletedUser.mockResolvedValueOnce(true);
    await expect(
      service.listRooms(eventId, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    repository.event.mockResolvedValueOnce(null);
    await expect(
      service.listRooms(eventId, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
    event.chatEnabled = false;
    await expect(
      service.listRooms(eventId, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'CHAT_UNAVAILABLE',
    });
  });

  it('requires membership for non-owners', async () => {
    participation.isJoined.mockResolvedValue(null);
    await expect(
      service.listRooms(eventId, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('lets owners read draft chats but not members', async () => {
    event.status = 'DRAFT';
    await expect(
      service.listRooms(eventId, owner, 'ORGANIZER', 'B'),
    ).resolves.toEqual({ items: [] });
    await expect(
      service.listRooms(eventId, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'CHAT_UNAVAILABLE',
    });
  });

  it('rechecks the live event before writing', async () => {
    const room = roomRow({ eventId, access: 'ALL_PARTICIPANTS' });
    repository.room.mockResolvedValue(room);
    events.get.mockResolvedValue(
      eventDetail({ id: eventId, status: 'CANCELLED' }),
    );
    await expect(
      service.send(eventId, room.id, member, 'USER', 'Hi', randomUUID(), 'B'),
    ).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE' });
  });
});

describe('rooms', () => {
  it('lists rooms with unread counts and last messages', async () => {
    const room = roomRow({ eventId, access: 'SELECTED_MEMBERS' });
    const later = new Date('2026-11-01T11:00:00.000Z');
    repository.rooms.mockResolvedValue([room]);
    repository.roomMember.mockResolvedValue({ joinedAt: later });
    repository.unreadCount.mockResolvedValue(3);
    const sender = randomUUID();
    repository.latestMessage.mockResolvedValue(
      messageRow({ senderId: sender }),
    );
    repository.userNames.mockResolvedValue([{ id: sender, name: 'Olena' }]);
    const { items } = await service.listRooms(eventId, member, 'USER', 'B');
    expect(items[0]).toMatchObject({
      unreadCount: 3,
      memberCount: 2,
      notificationsEnabled: true,
      lastMessage: { senderName: 'Olena', body: 'Hello' },
    });
    expect(repository.unreadCount).toHaveBeenCalledWith(room.id, member, later);
  });

  it('creates rooms and announces them', async () => {
    const room = roomRow({ eventId });
    repository.createRoom.mockResolvedValue(room);
    const other = randomUUID();
    const created = await service.createRoom(
      eventId,
      owner,
      'ORGANIZER',
      {
        name: 'Backstage',
        access: 'SELECTED_MEMBERS',
        memberIds: [other, owner, other],
      },
      'B',
    );
    expect(created.id).toBe(room.id);
    expect(repository.createRoom.mock.calls[0]![4]).toEqual([
      { userId: other, active: true },
    ]);
    expect(onChanged).toHaveBeenCalledWith([owner, member], eventId, room.id);
  });

  it('projects a missing event before creating its first room', async () => {
    repository.event.mockResolvedValueOnce(null).mockResolvedValue(event);
    repository.createRoom.mockResolvedValue(roomRow({ eventId }));
    await service.createRoom(
      eventId,
      owner,
      'ORGANIZER',
      { name: 'A', access: 'ALL_PARTICIPANTS', memberIds: [] },
      'B',
    );
    expect(repository.ensureEvent).toHaveBeenCalled();
    repository.event.mockResolvedValueOnce(null);
    await expect(
      service.createRoom(
        eventId,
        member,
        'USER',
        { name: 'A', access: 'ALL_PARTICIPANTS', memberIds: [] },
        'B',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('protects the General room and management rights', async () => {
    await expect(
      service.createRoom(
        eventId,
        owner,
        'ORGANIZER',
        { name: 'general', access: 'ALL_PARTICIPANTS', memberIds: [] },
        'B',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    repository.room.mockResolvedValue(roomRow({ eventId, name: 'General' }));
    await expect(
      service.updateRoom(
        eventId,
        randomUUID(),
        owner,
        'ORGANIZER',
        { name: 'X' },
        'B',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      service.updateRoom(
        eventId,
        randomUUID(),
        member,
        'USER',
        { name: 'X' },
        'B',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('updates, archives and fails for foreign rooms', async () => {
    const room = roomRow({ eventId });
    repository.room.mockResolvedValue(room);
    repository.updateRoom.mockResolvedValue({ ...room, name: 'New' });
    expect(
      (
        await service.updateRoom(
          eventId,
          room.id,
          owner,
          'ADMIN',
          { name: 'New' },
          'B',
        )
      ).name,
    ).toBe('New');
    repository.archiveRoom.mockResolvedValue({
      changed: true,
      room: { ...room, status: 'ARCHIVED' },
    });
    expect(
      (await service.archiveRoom(eventId, room.id, owner, 'ORGANIZER', 'B'))
        .status,
    ).toBe('ARCHIVED');
    await expect(
      service.archiveRoom(eventId, room.id, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    repository.room.mockResolvedValue(roomRow());
    await expect(
      service.updateRoom(
        eventId,
        room.id,
        owner,
        'ORGANIZER',
        { name: 'X' },
        'B',
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  });

  it('adds and removes members of selected rooms only', async () => {
    const room = roomRow({ eventId });
    repository.room.mockResolvedValue(room);
    const target = randomUUID();
    await service.addMembers(
      eventId,
      room.id,
      owner,
      'ORGANIZER',
      [target],
      'B',
    );
    expect(repository.addMembers).toHaveBeenCalledWith(room.id, owner, [
      { userId: target, active: true },
    ]);
    repository.removeMember.mockResolvedValue(true);
    expect(
      await service.removeMember(
        eventId,
        room.id,
        owner,
        'ORGANIZER',
        target,
        'B',
      ),
    ).toEqual({
      removed: true,
    });
    expect(onChanged).toHaveBeenLastCalledWith(
      [owner, member, target],
      eventId,
      room.id,
    );
    repository.room.mockResolvedValue({ ...room, access: 'ALL_PARTICIPANTS' });
    await expect(
      service.addMembers(eventId, room.id, owner, 'ORGANIZER', [target], 'B'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lists members with names', async () => {
    const room = roomRow({ eventId, access: 'ALL_PARTICIPANTS' });
    repository.room.mockResolvedValue(room);
    repository.roomMembers.mockResolvedValue([
      { userId: member, status: 'ACTIVE' },
    ]);
    repository.userNames.mockResolvedValue([{ id: member, name: 'Olena' }]);
    expect(
      await service.listMembers(eventId, room.id, member, 'USER', 'B'),
    ).toEqual({
      items: [{ userId: member, name: 'Olena', status: 'ACTIVE' }],
    });
  });
});

describe('selected room membership', () => {
  it('hides selected rooms from non-members', async () => {
    const room = roomRow({ eventId });
    repository.room.mockResolvedValue(room);
    repository.roomMember.mockResolvedValue({ status: 'REMOVED', joinedAt });
    await expect(
      service.listMessages(eventId, room.id, member, 'USER', 'B'),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('shows messages since the later of the two join dates', async () => {
    const room = roomRow({ eventId });
    const roomJoin = new Date('2026-11-01T12:00:00.000Z');
    repository.room.mockResolvedValue(room);
    repository.roomMember.mockResolvedValue({
      status: 'ACTIVE',
      joinedAt: roomJoin,
    });
    repository.messages.mockResolvedValue([]);
    await service.listMessages(eventId, room.id, member, 'USER', 'B');
    expect(repository.messages).toHaveBeenCalledWith(
      room.id,
      undefined,
      roomJoin,
    );
  });
});

describe('messages', () => {
  it('pages messages and names deleted senders', async () => {
    const room = roomRow({ eventId, access: 'ALL_PARTICIPANTS' });
    repository.room.mockResolvedValue(room);
    const rows = Array.from({ length: 51 }, () =>
      messageRow({ roomId: room.id, eventId }),
    );
    rows[0].senderId = null;
    repository.messages.mockResolvedValue(rows);
    const page = await service.listMessages(
      eventId,
      room.id,
      owner,
      'ORGANIZER',
      'B',
    );
    expect(page.items).toHaveLength(50);
    expect(page.items[0]!.senderName).toBe('Deleted user');
    expect(page.items[1]!.senderName).toBe('User');
    expect(page.nextBefore).toBe(rows[49].id);
    repository.messages.mockResolvedValue(null);
    await expect(
      service.listMessages(eventId, room.id, owner, 'ORGANIZER', 'B'),
    ).rejects.toMatchObject({
      code: 'RESOURCE_NOT_FOUND',
    });
  });

  it('sends a message and notifies silent and toast recipients', async () => {
    const room = roomRow({
      eventId,
      access: 'ALL_PARTICIPANTS',
      name: 'General',
    });
    repository.room.mockResolvedValue(room);
    const message = messageRow({
      roomId: room.id,
      eventId,
      senderId: member,
      body: 'Hi',
    });
    const silent = randomUUID();
    repository.send.mockResolvedValue({
      message,
      created: true,
      recipients: [owner, silent],
      toastRecipients: [owner],
    });
    repository.userNames.mockResolvedValue([{ id: member, name: 'Olena' }]);
    const sent = await service.send(
      eventId,
      room.id,
      member,
      'USER',
      'Hi',
      message.clientMessageId,
      'B',
    );
    expect(sent).toMatchObject({ body: 'Hi', senderName: 'Olena' });
    expect(onChanged).toHaveBeenCalledWith([silent], eventId, room.id);
    expect(onChanged).toHaveBeenCalledWith([owner], eventId, room.id, {
      id: message.id,
      roomName: 'General',
      senderId: member,
      senderName: 'Olena',
      body: 'Hi',
    });
  });

  it('does not notify again for a repeated client message', async () => {
    const room = roomRow({ eventId, access: 'ALL_PARTICIPANTS' });
    repository.room.mockResolvedValue(room);
    repository.send.mockResolvedValue({
      message: messageRow({ roomId: room.id, eventId }),
      created: false,
      recipients: [],
      toastRecipients: [],
    });
    await service.send(
      eventId,
      room.id,
      member,
      'USER',
      'Hi',
      randomUUID(),
      'B',
    );
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('refuses messages in archived rooms', async () => {
    repository.room.mockResolvedValue(
      roomRow({ eventId, access: 'ALL_PARTICIPANTS', status: 'ARCHIVED' }),
    );
    await expect(
      service.send(
        eventId,
        randomUUID(),
        member,
        'USER',
        'Hi',
        randomUUID(),
        'B',
      ),
    ).rejects.toMatchObject({ code: 'CHAT_UNAVAILABLE' });
  });

  it('marks messages read and saves notification preferences', async () => {
    const room = roomRow({ eventId, access: 'ALL_PARTICIPANTS' });
    repository.room.mockResolvedValue(room);
    repository.unreadCount.mockResolvedValue(0);
    const messageId = randomUUID();
    expect(
      await service.markRead(eventId, room.id, member, 'USER', messageId, 'B'),
    ).toEqual({
      unreadCount: 0,
    });
    expect(repository.markRead).toHaveBeenCalledWith(
      room.id,
      member,
      messageId,
      joinedAt,
    );
    expect(
      await service.updateNotificationPreference(
        eventId,
        room.id,
        member,
        'USER',
        false,
        'B',
      ),
    ).toEqual({ enabled: false });
    expect(onChanged).toHaveBeenCalledWith([member], eventId, room.id);
  });
});

describe('overview', () => {
  it('counts unread messages only for accessible events', async () => {
    const other = randomUUID();
    repository.overview.mockResolvedValue([
      {
        eventId,
        organizerId: owner,
        title: 'Mine',
        unreadCount: 2,
        lastMessageAt: new Date(),
      },
      {
        eventId: other,
        organizerId: randomUUID(),
        title: 'Left',
        unreadCount: 5,
        lastMessageAt: null,
      },
    ]);
    participation.isJoined.mockResolvedValue(null);
    const overview = await service.overview(owner, 'B');
    expect(overview.totalUnread).toBe(2);
    expect(overview.events.map((item) => item.title)).toEqual(['Mine']);
  });

  it('logs realtime failures without failing the action', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    repository.participants.mockRejectedValue(new Error('db'));
    repository.createRoom.mockResolvedValue(roomRow({ eventId }));
    await expect(
      service.createRoom(
        eventId,
        owner,
        'ORGANIZER',
        { name: 'A', access: 'ALL_PARTICIPANTS', memberIds: [] },
        'B',
      ),
    ).resolves.toBeDefined();
  });
});
