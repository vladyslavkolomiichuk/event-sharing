import { prisma } from '../database/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { CHAT_READABLE_STATUSES } from '../domain/ChatAvailability.js';
import { ChatRoomExistsError } from '../domain/errors/ChatRoomExistsError.js';
import { MessageRateLimitError } from '../domain/errors/MessageRateLimitError.js';
import { MessageConflictError } from '../domain/errors/MessageConflictError.js';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';
import { RoomAccessLockedError } from '../domain/errors/RoomAccessLockedError.js';
import {
  EVENT_TYPES,
  ChatMembershipChangedPayloadSchema,
  ChatMessageCreatedPayloadSchema,
  type ChatRoomAccess,
  type EventDetail,
} from '@event-sharing/contracts';

export class ChatRepository {
  async eventsWithUser(userId: string): Promise<string[]> {
    const [organized, memberships, messages] = await Promise.all([
      prisma.eventProjection.findMany({
        where: { organizerId: userId, chatEnabled: true },
        select: { id: true },
      }),
      prisma.membershipProjection.findMany({
        where: { userId, active: true },
        select: { eventId: true },
      }),
      prisma.chatMessage.findMany({
        where: { senderId: userId },
        select: { eventId: true },
        distinct: ['eventId'],
      }),
    ]);
    return [
      ...new Set([
        ...organized.map((event) => event.id),
        ...memberships.map((membership) => membership.eventId),
        ...messages.map((message) => message.eventId),
      ]),
    ];
  }

  async participants(eventId: string, roomId?: string): Promise<string[]> {
    const [event, members] = await Promise.all([
      this.event(eventId),
      roomId
        ? prisma.chatRoomMember.findMany({
            where: { roomId, status: 'ACTIVE' },
            select: { userId: true },
          })
        : prisma.membershipProjection.findMany({
            where: { eventId, active: true },
            select: { userId: true },
          }),
    ]);
    return [
      ...new Set([
        ...(event ? [event.organizerId] : []),
        ...members.map((member) => member.userId),
      ]),
    ];
  }

  event(id: string) {
    return prisma.eventProjection.findUnique({ where: { id } });
  }
  ensureEvent(event: EventDetail) {
    return prisma.$transaction(async (transaction) => {
      const projected = await transaction.eventProjection.upsert({
        where: { id: event.id },
        create: {
          id: event.id,
          organizerId: event.organizerId,
          title: event.title,
          status: event.status,
          chatEnabled: event.chatEnabled,
          version: event.version,
        },
        update: {},
      });
      if (event.chatEnabled)
        await transaction.chatRoom.createMany({
          data: {
            eventId: event.id,
            name: 'General',
            createdBy: event.organizerId,
          },
          skipDuplicates: true,
        });
      return projected;
    });
  }
  membership(eventId: string, userId: string) {
    return prisma.membershipProjection.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }
  room(id: string) {
    return prisma.chatRoom.findUnique({ where: { id } });
  }
  roomMember(roomId: string, userId: string) {
    return prisma.chatRoomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
  }
  roomMembers(roomId: string) {
    return prisma.chatRoomMember.findMany({
      where: { roomId, status: { not: 'REMOVED' } },
      orderBy: { joinedAt: 'asc' },
    });
  }
  rooms(eventId: string, userId: string, owner: boolean) {
    return prisma.chatRoom.findMany({
      where: {
        eventId,
        archivedAt: null,
        ...(!owner
          ? {
              OR: [
                { access: 'ALL_PARTICIPANTS' },
                { members: { some: { userId, status: 'ACTIVE' } } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { members: { where: { status: 'ACTIVE' } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
  latestMessage(roomId: string, visibleSince?: Date) {
    return prisma.chatMessage.findFirst({
      where: {
        roomId,
        ...(visibleSince ? { createdAt: { gte: visibleSince } } : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  async unreadCount(roomId: string, userId: string, joinedAt?: Date) {
    const read = await prisma.chatReadState.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    return prisma.chatMessage.count({
      where: {
        roomId,
        senderId: { not: userId },
        ...(joinedAt ? { createdAt: { gte: joinedAt } } : {}),
        ...(read
          ? {
              OR: [
                { createdAt: { gt: read.lastReadAt } },
                {
                  createdAt: read.lastReadAt,
                  id: { gt: read.lastReadMessageId },
                },
              ],
            }
          : {}),
      },
    });
  }
  async overview(userId: string) {
    return prisma.$queryRaw<
      {
        eventId: string;
        title: string;
        unreadCount: number;
        lastMessageAt: Date | null;
      }[]
    >`
      SELECT
        event.id AS "eventId",
        event.title,
        COUNT(message.id) FILTER (
          WHERE message."senderId" <> ${userId}::uuid
            AND (event."organizerId" = ${userId}::uuid OR message."createdAt" >= membership."joinedAt")
            AND (room.access = 'ALL_PARTICIPANTS' OR event."organizerId" = ${userId}::uuid OR message."createdAt" >= group_member."joinedAt")
            AND (
              read."lastReadAt" IS NULL
              OR message."createdAt" > read."lastReadAt"
              OR (message."createdAt" = read."lastReadAt" AND message.id > read."lastReadMessageId")
            )
        )::integer AS "unreadCount",
        MAX(message."createdAt") AS "lastMessageAt"
      FROM "event_projection" event
      LEFT JOIN "membership_projection" membership
        ON membership."eventId" = event.id AND membership."userId" = ${userId}::uuid
      JOIN "chat_room" room ON room."eventId" = event.id AND room."archivedAt" IS NULL
      LEFT JOIN "chat_room_member" group_member
        ON group_member."roomId" = room.id AND group_member."userId" = ${userId}::uuid
      LEFT JOIN "chat_message" message ON message."roomId" = room.id
      LEFT JOIN "chat_read_state" read
        ON read."roomId" = room.id AND read."userId" = ${userId}::uuid
      WHERE event."chatEnabled" = true
        AND event.status IN (${Prisma.join([...CHAT_READABLE_STATUSES])})
        AND (event."organizerId" = ${userId}::uuid OR membership.active = true)
        AND (room.access = 'ALL_PARTICIPANTS' OR event."organizerId" = ${userId}::uuid OR group_member.status = 'ACTIVE')
      GROUP BY event.id, event.title
      ORDER BY MAX(message."createdAt") DESC NULLS LAST, event.title
    `;
  }
  async markRead(
    roomId: string,
    userId: string,
    messageId: string,
    visibleSince?: Date,
  ) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${roomId}), hashtext(${userId}))`;
      const message = await transaction.chatMessage.findFirst({
        where: {
          id: messageId,
          roomId,
          ...(visibleSince ? { createdAt: { gte: visibleSince } } : {}),
        },
      });
      if (!message) throw new ResourceNotFoundError();
      const existing = await transaction.chatReadState.findUnique({
        where: { roomId_userId: { roomId, userId } },
      });
      if (
        existing &&
        (existing.lastReadAt > message.createdAt ||
          (existing.lastReadAt.getTime() === message.createdAt.getTime() &&
            existing.lastReadMessageId >= message.id))
      ) {
        return existing;
      }
      return transaction.chatReadState.upsert({
        where: { roomId_userId: { roomId, userId } },
        create: {
          roomId,
          userId,
          lastReadAt: message.createdAt,
          lastReadMessageId: message.id,
        },
        update: {
          lastReadAt: message.createdAt,
          lastReadMessageId: message.id,
        },
      });
    });
  }
  async createRoom(
    eventId: string,
    name: string,
    createdBy: string,
    access: ChatRoomAccess,
    members: { userId: string; active: boolean }[],
  ) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${eventId}))`;
      const existing = await transaction.chatRoom.findFirst({
        where: { eventId, name: { equals: name, mode: 'insensitive' } },
      });
      if (existing) throw new ChatRoomExistsError();
      const count = await transaction.chatRoom.count({
        where: { eventId, archivedAt: null },
      });
      if (count >= 20) return null;
      const room = await transaction.chatRoom.create({
        data: {
          eventId,
          name,
          createdBy,
          access,
          members: {
            create: members.map((member) => ({
              userId: member.userId,
              status: member.active ? 'ACTIVE' : 'PENDING',
              joinedAt: member.active ? new Date() : null,
            })),
          },
        },
      });
      for (const member of members.filter((item) => item.active)) {
        await this.queueMemberChange(
          transaction,
          room,
          member.userId,
          createdBy,
          'ADDED',
        );
      }
      return room;
    });
  }
  updateRoom(id: string, name?: string, access?: ChatRoomAccess) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "chat_room" WHERE "id" = ${id}::uuid FOR UPDATE`;
      const room = await transaction.chatRoom.findUnique({ where: { id } });
      if (!room || room.archivedAt) throw new ResourceNotFoundError();
      if (access && access !== room.access) {
        const messageCount = await transaction.chatMessage.count({
          where: { roomId: id },
        });
        if (messageCount > 0) throw new RoomAccessLockedError();
      }
      if (name && name.toLowerCase() !== room.name.toLowerCase()) {
        const duplicate = await transaction.chatRoom.findFirst({
          where: {
            eventId: room.eventId,
            id: { not: id },
            name: { equals: name, mode: 'insensitive' },
          },
        });
        if (duplicate) throw new ChatRoomExistsError();
      }
      try {
        return await transaction.chatRoom.update({
          where: { id },
          data: { ...(name ? { name } : {}), ...(access ? { access } : {}) },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        )
          throw new ChatRoomExistsError();
        throw error;
      }
    });
  }
  async addMembers(
    roomId: string,
    actorId: string,
    members: { userId: string; active: boolean }[],
  ) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "chat_room" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
      const room = await transaction.chatRoom.findUnique({
        where: { id: roomId },
      });
      if (!room || room.archivedAt) throw new ResourceNotFoundError();
      for (const member of members) {
        const existing = await transaction.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId, userId: member.userId } },
        });
        if (existing && existing.status !== 'REMOVED') continue;
        await transaction.chatRoomMember.upsert({
          where: { roomId_userId: { roomId, userId: member.userId } },
          create: {
            roomId,
            userId: member.userId,
            status: member.active ? 'ACTIVE' : 'PENDING',
            joinedAt: member.active ? new Date() : null,
          },
          update: {
            status: member.active ? 'ACTIVE' : 'PENDING',
            joinedAt: member.active ? new Date() : null,
            removedAt: null,
          },
        });
        if (member.active)
          await this.queueMemberChange(
            transaction,
            room,
            member.userId,
            actorId,
            'ADDED',
          );
      }
    });
  }
  async removeMember(roomId: string, userId: string, actorId: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM "chat_room" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
      const room = await transaction.chatRoom.findUnique({
        where: { id: roomId },
      });
      if (!room || room.archivedAt) throw new ResourceNotFoundError();
      const changed = await transaction.chatRoomMember.updateMany({
        where: { roomId, userId, status: { not: 'REMOVED' } },
        data: { status: 'REMOVED', removedAt: new Date() },
      });
      if (changed.count)
        await this.queueMemberChange(
          transaction,
          room,
          userId,
          actorId,
          'REMOVED',
        );
      return changed.count > 0;
    });
  }
  private async queueMemberChange(
    transaction: Prisma.TransactionClient,
    room: { id: string; eventId: string; name: string },
    subjectId: string,
    actorId: string,
    change: 'ADDED' | 'REMOVED',
  ) {
    const members = await transaction.chatRoomMember.findMany({
      where: { roomId: room.id, status: 'ACTIVE' },
      select: { userId: true },
    });
    const recipients = new Set([
      ...members.map((member) => member.userId),
      subjectId,
    ]);
    recipients.delete(actorId);
    for (const recipientId of recipients) {
      await transaction.outboxEvent.create({
        data: {
          aggregateId: room.eventId,
          eventType: EVENT_TYPES.chatMembershipChanged,
          payload: ChatMembershipChangedPayloadSchema.parse({
            eventId: room.eventId,
            roomId: room.id,
            roomName: room.name,
            recipientId,
            subjectId,
            actorId,
            change,
          }),
        },
      });
    }
  }
  archiveRoom(id: string) {
    return prisma.chatRoom.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
  async messages(roomId: string, before?: string, visibleSince?: Date) {
    const cursor = before
      ? await prisma.chatMessage.findFirst({
          where: { id: before, roomId },
          select: { id: true, createdAt: true },
        })
      : null;
    if (before && !cursor) return null;
    return prisma.chatMessage.findMany({
      where: {
        roomId,
        ...(visibleSince ? { createdAt: { gte: visibleSince } } : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 51,
    });
  }
  async send(
    roomId: string,
    eventId: string,
    senderId: string,
    body: string,
    clientMessageId: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      const rooms = await transaction.$queryRaw<
        {
          eventId: string;
          archivedAt: Date | null;
          access: string;
          name: string;
        }[]
      >`SELECT "eventId", "archivedAt", "access", "name" FROM "chat_room" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
      const room = rooms[0];
      if (!room || room.eventId !== eventId || room.archivedAt)
        throw new ResourceNotFoundError();
      const event = await transaction.eventProjection.findUnique({
        where: { id: eventId },
      });
      if (!event) throw new ResourceNotFoundError();
      if (
        room.access === 'SELECTED_MEMBERS' &&
        event.organizerId !== senderId
      ) {
        const member = await transaction.chatRoomMember.findUnique({
          where: { roomId_userId: { roomId, userId: senderId } },
        });
        if (member?.status !== 'ACTIVE') throw new ResourceNotFoundError();
      }
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${senderId}))`;
      const existing = await transaction.chatMessage.findUnique({
        where: { senderId_clientMessageId: { senderId, clientMessageId } },
      });
      if (existing) {
        if (existing.roomId !== roomId || existing.body !== body)
          throw new MessageConflictError();
        return { message: existing, created: false };
      }
      const recent = await transaction.chatMessage.count({
        where: { senderId, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (recent >= 30) throw new MessageRateLimitError();
      const message = await transaction.chatMessage.create({
        data: { roomId, eventId, senderId, body, clientMessageId },
      });
      const eventMembers = (
        await transaction.membershipProjection.findMany({
          where: { eventId, active: true },
          select: { userId: true },
        })
      ).map((member) => member.userId);
      const recipients =
        room.access === 'SELECTED_MEMBERS'
          ? (
              await transaction.chatRoomMember.findMany({
                where: {
                  roomId,
                  status: 'ACTIVE',
                  userId: { in: eventMembers },
                },
                select: { userId: true },
              })
            ).map((member) => member.userId)
          : eventMembers;
      for (const recipientId of new Set([...recipients, event.organizerId])) {
        if (recipientId === senderId) continue;
        await transaction.outboxEvent.create({
          data: {
            aggregateId: eventId,
            eventType: EVENT_TYPES.chatMessageCreated,
            payload: ChatMessageCreatedPayloadSchema.parse({
              eventId,
              roomId,
              roomName: room.name,
              messageId: message.id,
              senderId,
              recipientId,
            }),
          },
        });
      }
      return { message, created: true };
    });
  }
  userNames(ids: string[]) {
    return prisma.userProjection.findMany({ where: { id: { in: ids } } });
  }
}
