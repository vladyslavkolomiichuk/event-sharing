import {
  ChatMessageSchema,
  ChatOverviewSchema,
  ChatRoomSchema,
  type UserRole,
} from '@event-sharing/contracts';
import { ChatUnavailableError } from '../domain/errors/ChatUnavailableError.js';
import { isChatAvailable } from '../domain/ChatAvailability.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';
import { ChatRepository } from '../repositories/ChatRepository.js';

export class ChatService {
  constructor(
    private readonly repository = new ChatRepository(),
    private readonly onChanged: (
      userIds: string[],
      eventId: string,
      roomId?: string,
    ) => void = () => {},
  ) {}

  private async changed(eventId: string, roomId?: string): Promise<void> {
    try {
      this.onChanged(
        await this.repository.participants(eventId),
        eventId,
        roomId,
      );
    } catch (error) {
      console.error('Messages realtime update failed.', error);
    }
  }

  private async access(eventId: string, userId: string, role: UserRole) {
    const event = await this.repository.event(eventId);
    if (!event) throw new ResourceNotFoundError();
    if (!event.chatEnabled || !isChatAvailable(event.status))
      throw new ChatUnavailableError();
    if (event.organizerId !== userId && role !== 'ADMIN') {
      const member = await this.repository.membership(eventId, userId);
      if (!member?.active) throw new ForbiddenError();
    }
    return event;
  }

  async listRooms(eventId: string, userId: string, role: UserRole) {
    const event = await this.access(eventId, userId, role);
    const membership =
      event.organizerId === userId || role === 'ADMIN'
        ? null
        : await this.repository.membership(eventId, userId);
    const rooms = await this.repository.rooms(eventId);
    const details = await Promise.all(
      rooms.map(async (room) => {
        const [unreadCount, lastMessage] = await Promise.all([
          this.repository.unreadCount(room.id, userId, membership?.joinedAt),
          this.repository.latestMessage(room.id),
        ]);
        return { room, unreadCount, lastMessage };
      }),
    );
    const names = new Map(
      (
        await this.repository.userNames(
          details.flatMap(({ lastMessage }) =>
            lastMessage ? [lastMessage.senderId] : [],
          ),
        )
      ).map((user) => [user.id, user.name]),
    );
    return {
      items: details.map(({ room, unreadCount, lastMessage }) =>
        this.roomResponse(
          room,
          unreadCount,
          lastMessage
            ? {
                body: lastMessage.body,
                senderName: names.get(lastMessage.senderId) ?? 'User',
                createdAt: lastMessage.createdAt.toISOString(),
              }
            : null,
        ),
      ),
    };
  }

  async overview(userId: string) {
    const events = (await this.repository.overview(userId)).map((event) => ({
      ...event,
      lastMessageAt: event.lastMessageAt?.toISOString() ?? null,
    }));
    return ChatOverviewSchema.parse({
      totalUnread: events.reduce((sum, event) => sum + event.unreadCount, 0),
      events,
    });
  }

  async markRead(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    messageId: string,
  ) {
    const event = await this.access(eventId, userId, role);
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    await this.repository.markRead(roomId, userId, messageId);
    this.onChanged([userId], eventId, roomId);
    const membership =
      event.organizerId === userId || role === 'ADMIN'
        ? null
        : await this.repository.membership(eventId, userId);
    return {
      unreadCount: await this.repository.unreadCount(
        roomId,
        userId,
        membership?.joinedAt,
      ),
    };
  }

  async createRoom(
    eventId: string,
    userId: string,
    role: UserRole,
    name: string,
  ) {
    const event = await this.access(eventId, userId, role);
    if (event.organizerId !== userId && role !== 'ADMIN')
      throw new ForbiddenError();
    const room = await this.repository.createRoom(eventId, name, userId);
    if (!room) throw new ChatUnavailableError();
    await this.changed(eventId, room.id);
    return this.roomResponse(room);
  }

  async archiveRoom(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
  ) {
    const event = await this.access(eventId, userId, role);
    if (event.organizerId !== userId && role !== 'ADMIN')
      throw new ForbiddenError();
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId) throw new ResourceNotFoundError();
    if (room.name === 'General') throw new ForbiddenError();
    const archived = room.archivedAt
      ? room
      : await this.repository.archiveRoom(roomId);
    if (!room.archivedAt) await this.changed(eventId, roomId);
    return this.roomResponse(archived);
  }

  async listMessages(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    before?: string,
  ) {
    await this.access(eventId, userId, role);
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    const records = await this.repository.messages(roomId, before);
    if (!records) throw new ResourceNotFoundError();
    const page = records.slice(0, 50);
    const names = new Map(
      (await this.repository.userNames(page.map((item) => item.senderId))).map(
        (user) => [user.id, user.name],
      ),
    );
    return {
      items: page.map((item) =>
        this.messageResponse(item, names.get(item.senderId) ?? 'User'),
      ),
      nextBefore: records.length > 50 ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async send(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    body: string,
  ) {
    await this.access(eventId, userId, role);
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    const item = await this.repository.send(roomId, eventId, userId, body);
    await this.changed(eventId, roomId);
    const user = (await this.repository.userNames([userId]))[0];
    return this.messageResponse(item, user?.name ?? 'User');
  }

  private roomResponse(
    room: {
      id: string;
      eventId: string;
      name: string;
      createdAt: Date;
      archivedAt: Date | null;
    },
    unreadCount = 0,
    lastMessage: {
      body: string;
      senderName: string;
      createdAt: string;
    } | null = null,
  ) {
    return ChatRoomSchema.parse({
      id: room.id,
      eventId: room.eventId,
      name: room.name,
      createdAt: room.createdAt.toISOString(),
      archivedAt: room.archivedAt?.toISOString() ?? null,
      unreadCount,
      lastMessage,
    });
  }
  private messageResponse(
    item: {
      id: string;
      roomId: string;
      eventId: string;
      senderId: string;
      body: string;
      createdAt: Date;
    },
    senderName: string,
  ) {
    return ChatMessageSchema.parse({
      ...item,
      senderName,
      createdAt: item.createdAt.toISOString(),
    });
  }
}
