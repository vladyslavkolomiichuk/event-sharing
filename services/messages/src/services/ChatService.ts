import {
  ChatMessageSchema,
  ChatOverviewSchema,
  ChatRoomMemberSchema,
  ChatRoomSchema,
  type ChatRealtimeMessage,
  type CreateChatRoom,
  type UpdateChatRoom,
  type UserRole,
} from '@event-sharing/contracts';
import { EventDirectoryClient } from '../clients/EventDirectoryClient.js';
import { ParticipationMemberClient } from '../clients/ParticipationMemberClient.js';
import { isChatAvailable, isChatReadable } from '../domain/ChatAvailability.js';
import { ChatUnavailableError } from '../domain/errors/ChatUnavailableError.js';
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
      message?: ChatRealtimeMessage,
    ) => void = () => {},
    private readonly participation = new ParticipationMemberClient(),
    private readonly events = new EventDirectoryClient(),
  ) {}

  private async changed(
    eventId: string,
    roomId?: string,
    extra: string[] = [],
  ) {
    try {
      const recipients = await this.repository.participants(eventId, roomId);
      this.onChanged([...new Set([...recipients, ...extra])], eventId, roomId);
    } catch (error) {
      console.error('Messages realtime update failed.', error);
    }
  }

  private async access(
    eventId: string,
    userId: string,
    role: UserRole,
    authorization: string,
    action: 'read' | 'write' | 'manage' = 'read',
  ) {
    if (await this.repository.isDeletedUser(userId)) throw new ForbiddenError();
    const event = await this.repository.event(eventId);
    if (!event) throw new ResourceNotFoundError();
    const owner = event.organizerId === userId;
    if (!event.chatEnabled) throw new ChatUnavailableError();
    const allowed =
      action === 'manage'
        ? [
            'DRAFT',
            'MODERATION',
            'REJECTED',
            'APPROVED',
            'PUBLISHED',
            'ONGOING',
          ].includes(event.status)
        : action === 'write'
          ? isChatAvailable(event.status)
          : owner &&
              ['DRAFT', 'MODERATION', 'REJECTED', 'APPROVED'].includes(
                event.status,
              )
            ? true
            : isChatReadable(event.status);
    if (!allowed) throw new ChatUnavailableError();
    if (action === 'manage' && !owner && role !== 'ADMIN')
      throw new ForbiddenError();
    const joinedAt = owner
      ? null
      : await this.participation.isJoined(eventId, userId, authorization);
    if (!owner && !joinedAt) throw new ForbiddenError();
    if (action === 'write') {
      const current = await this.events.get(eventId, authorization);
      if (!current.chatEnabled || !isChatAvailable(current.status))
        throw new ChatUnavailableError();
    }
    return { event, owner, joinedAt };
  }

  private async roomAccess(
    eventId: string,
    roomId: string,
    userId: string,
    owner: boolean,
    eventJoinedAt: Date | null,
  ) {
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId) throw new ResourceNotFoundError();
    if (room.access === 'ALL_PARTICIPANTS' || owner)
      return { room, visibleSince: eventJoinedAt ?? undefined };
    const member = await this.repository.roomMember(roomId, userId);
    if (member?.status !== 'ACTIVE' || !member.joinedAt)
      throw new ForbiddenError();
    const visibleSince =
      eventJoinedAt && eventJoinedAt > member.joinedAt
        ? eventJoinedAt
        : member.joinedAt;
    return { room, visibleSince };
  }

  async listRooms(
    eventId: string,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    const { owner, joinedAt } = await this.access(
      eventId,
      userId,
      role,
      authorization,
    );
    const rooms = await this.repository.rooms(eventId, userId, owner);
    const details = await Promise.all(
      rooms.map(async (room) => {
        const member =
          room.access === 'SELECTED_MEMBERS' && !owner
            ? await this.repository.roomMember(room.id, userId)
            : null;
        const since =
          member?.joinedAt && joinedAt && member.joinedAt > joinedAt
            ? member.joinedAt
            : (joinedAt ?? undefined);
        const [unreadCount, lastMessage] = await Promise.all([
          this.repository.unreadCount(room.id, userId, since),
          this.repository.latestMessage(room.id, since),
        ]);
        return { room, unreadCount, lastMessage };
      }),
    );
    const names = new Map(
      (
        await this.repository.userNames(
          details.flatMap(({ lastMessage }) =>
            lastMessage?.senderId ? [lastMessage.senderId] : [],
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
                senderName: lastMessage.senderId
                  ? (names.get(lastMessage.senderId) ?? 'User')
                  : 'Deleted user',
                createdAt: lastMessage.createdAt.toISOString(),
              }
            : null,
        ),
      ),
    };
  }

  async overview(userId: string, authorization: string) {
    const candidates = await this.repository.overview(userId);
    const checked = await Promise.all(
      candidates.map(async (event) => ({
        event,
        allowed:
          event.organizerId === userId ||
          Boolean(
            await this.participation.isJoined(
              event.eventId,
              userId,
              authorization,
            ),
          ),
      })),
    );
    const events = checked
      .filter((item) => item.allowed)
      .map(({ event }) => ({
        eventId: event.eventId,
        title: event.title,
        unreadCount: event.unreadCount,
        lastMessageAt: event.lastMessageAt?.toISOString() ?? null,
      }));
    return ChatOverviewSchema.parse({
      totalUnread: events.reduce((sum, event) => sum + event.unreadCount, 0),
      events,
    });
  }

  async listMembers(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    const access = await this.access(eventId, userId, role, authorization);
    await this.roomAccess(
      eventId,
      roomId,
      userId,
      access.owner,
      access.joinedAt,
    );
    const members = await this.repository.roomMembers(roomId);
    const names = new Map(
      (
        await this.repository.userNames(members.map((member) => member.userId))
      ).map((user) => [user.id, user.name]),
    );
    return {
      items: members.map((member) =>
        ChatRoomMemberSchema.parse({
          userId: member.userId,
          name: names.get(member.userId) ?? 'User',
          status: member.status,
        }),
      ),
    };
  }

  async markRead(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    messageId: string,
    authorization: string,
  ) {
    const access = await this.access(eventId, userId, role, authorization);
    const { visibleSince } = await this.roomAccess(
      eventId,
      roomId,
      userId,
      access.owner,
      access.joinedAt,
    );
    await this.repository.markRead(roomId, userId, messageId, visibleSince);
    this.onChanged([userId], eventId, roomId);
    return {
      unreadCount: await this.repository.unreadCount(
        roomId,
        userId,
        visibleSince,
      ),
    };
  }

  async createRoom(
    eventId: string,
    userId: string,
    role: UserRole,
    input: CreateChatRoom,
    authorization: string,
  ) {
    if (!(await this.repository.event(eventId))) {
      const detail = await this.events.get(eventId, authorization);
      if (detail.organizerId !== userId && role !== 'ADMIN')
        throw new ForbiddenError();
      await this.repository.ensureEvent(detail);
    }
    await this.access(eventId, userId, role, authorization, 'manage');
    if (input.name.toLowerCase() === 'general') throw new ForbiddenError();
    const members =
      input.access === 'SELECTED_MEMBERS'
        ? await this.prepareMembers(
            eventId,
            userId,
            input.memberIds,
            authorization,
          )
        : [];
    const room = await this.repository.createRoom(
      eventId,
      input.name,
      userId,
      input.access,
      members,
    );
    if (!room) throw new ChatUnavailableError();
    await this.changed(eventId, room.id);
    return this.roomResponse(room);
  }

  async updateRoom(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    input: UpdateChatRoom,
    authorization: string,
  ) {
    await this.access(eventId, userId, role, authorization, 'manage');
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    if (room.name === 'General' || input.name?.toLowerCase() === 'general')
      throw new ForbiddenError();
    const updated = await this.repository.updateRoom(
      roomId,
      input.name,
      input.access,
    );
    await this.changed(eventId, roomId);
    return this.roomResponse(updated);
  }

  async addMembers(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    memberIds: string[],
    authorization: string,
  ) {
    await this.access(eventId, userId, role, authorization, 'manage');
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    if (room.access !== 'SELECTED_MEMBERS') throw new ForbiddenError();
    const members = await this.prepareMembers(
      eventId,
      userId,
      memberIds,
      authorization,
    );
    await this.repository.addMembers(roomId, userId, members);
    await this.changed(eventId, roomId, memberIds);
    return this.listMembers(eventId, roomId, userId, role, authorization);
  }

  async removeMember(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    targetId: string,
    authorization: string,
  ) {
    await this.access(eventId, userId, role, authorization, 'manage');
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId || room.archivedAt)
      throw new ResourceNotFoundError();
    if (room.access !== 'SELECTED_MEMBERS') throw new ForbiddenError();
    const removed = await this.repository.removeMember(
      roomId,
      targetId,
      userId,
    );
    if (removed) await this.changed(eventId, roomId, [targetId]);
    return { removed };
  }

  async archiveRoom(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    authorization: string,
  ) {
    const access = await this.access(eventId, userId, role, authorization);
    if (!access.owner) throw new ForbiddenError();
    const room = await this.repository.room(roomId);
    if (!room || room.eventId !== eventId) throw new ResourceNotFoundError();
    const archived = await this.repository.archiveRoom(roomId);
    if (archived.changed) await this.changed(eventId, roomId);
    return this.roomResponse(archived.room);
  }

  async listMessages(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    authorization: string,
    before?: string,
  ) {
    const access = await this.access(eventId, userId, role, authorization);
    const { visibleSince } = await this.roomAccess(
      eventId,
      roomId,
      userId,
      access.owner,
      access.joinedAt,
    );
    const records = await this.repository.messages(
      roomId,
      before,
      visibleSince,
    );
    if (!records) throw new ResourceNotFoundError();
    const page = records.slice(0, 50);
    const names = new Map(
      (
        await this.repository.userNames(
          page.flatMap((item) => (item.senderId ? [item.senderId] : [])),
        )
      ).map((user) => [user.id, user.name]),
    );
    return {
      items: page.map((item) =>
        this.messageResponse(
          item,
          item.senderId ? (names.get(item.senderId) ?? 'User') : 'Deleted user',
        ),
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
    clientMessageId: string,
    authorization: string,
  ) {
    const access = await this.access(
      eventId,
      userId,
      role,
      authorization,
      'write',
    );
    const { room } = await this.roomAccess(
      eventId,
      roomId,
      userId,
      access.owner,
      access.joinedAt,
    );
    if (room.status !== 'ACTIVE') throw new ChatUnavailableError();
    const { message, created, recipients, toastRecipients } =
      await this.repository.send(
        roomId,
        eventId,
        userId,
        body,
        clientMessageId,
      );
    const user = (await this.repository.userNames([userId]))[0];
    const senderName = user?.name ?? 'User';
    if (created) {
      const toastRecipientIds = new Set(toastRecipients);
      const silentRecipients = recipients.filter(
        (recipientId) => !toastRecipientIds.has(recipientId),
      );
      this.onChanged(silentRecipients, eventId, roomId);
      this.onChanged(toastRecipients, eventId, roomId, {
        id: message.id,
        roomName: room.name,
        senderId: userId,
        senderName,
        body: message.body,
      });
    }
    return this.messageResponse(message, senderName);
  }

  async updateNotificationPreference(
    eventId: string,
    roomId: string,
    userId: string,
    role: UserRole,
    enabled: boolean,
    authorization: string,
  ) {
    const access = await this.access(eventId, userId, role, authorization);
    await this.roomAccess(
      eventId,
      roomId,
      userId,
      access.owner,
      access.joinedAt,
    );
    await this.repository.setNotificationPreference(roomId, userId, enabled);
    this.onChanged([userId], eventId, roomId);
    return { enabled };
  }

  private async prepareMembers(
    eventId: string,
    actorId: string,
    ids: string[],
    authorization: string,
  ) {
    return Promise.all(
      [...new Set(ids)]
        .filter((id) => id !== actorId)
        .map(async (userId) => ({
          userId,
          active: Boolean(
            await this.participation.isJoined(eventId, userId, authorization),
          ),
        })),
    );
  }

  private roomResponse(
    room: {
      id: string;
      eventId: string;
      name: string;
      access: string;
      status: string;
      createdAt: Date;
      archivedAt: Date | null;
      _count?: { members: number };
      notificationPreferences?: { enabled: boolean }[];
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
      access: room.access,
      status: room.status,
      memberCount: room._count?.members ?? 0,
      createdAt: room.createdAt.toISOString(),
      archivedAt: room.archivedAt?.toISOString() ?? null,
      notificationsEnabled: room.notificationPreferences?.[0]?.enabled ?? true,
      unreadCount,
      lastMessage,
    });
  }

  private messageResponse(
    item: {
      id: string;
      roomId: string;
      eventId: string;
      senderId: string | null;
      clientMessageId: string | null;
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
