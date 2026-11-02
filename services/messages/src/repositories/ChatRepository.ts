import { prisma } from '../database/client.js';
import { Prisma } from '../generated/prisma/client.js';
import { CHAT_ACTIVE_STATUSES } from '../domain/ChatAvailability.js';
import { ChatRoomExistsError } from '../domain/errors/ChatRoomExistsError.js';
import { MessageRateLimitError } from '../domain/errors/MessageRateLimitError.js';
import { ResourceNotFoundError } from '../domain/errors/ResourceNotFoundError.js';

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

  async participants(eventId: string): Promise<string[]> {
    const [event, members] = await Promise.all([
      this.event(eventId),
      prisma.membershipProjection.findMany({
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
  membership(eventId: string, userId: string) {
    return prisma.membershipProjection.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }
  room(id: string) {
    return prisma.chatRoom.findUnique({ where: { id } });
  }
  rooms(eventId: string) {
    return prisma.chatRoom.findMany({
      where: { eventId, archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
  latestMessage(roomId: string) {
    return prisma.chatMessage.findFirst({
      where: { roomId },
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
      LEFT JOIN "chat_message" message ON message."roomId" = room.id
      LEFT JOIN "chat_read_state" read
        ON read."roomId" = room.id AND read."userId" = ${userId}::uuid
      WHERE event."chatEnabled" = true
        AND event.status IN (${Prisma.join([...CHAT_ACTIVE_STATUSES])})
        AND (event."organizerId" = ${userId}::uuid OR membership.active = true)
      GROUP BY event.id, event.title
      ORDER BY MAX(message."createdAt") DESC NULLS LAST, event.title
    `;
  }
  async markRead(roomId: string, userId: string, messageId: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${roomId}), hashtext(${userId}))`;
      const message = await transaction.chatMessage.findFirst({
        where: { id: messageId, roomId },
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
  async createRoom(eventId: string, name: string, createdBy: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${eventId}))`;
      const existing = await transaction.chatRoom.findUnique({
        where: { eventId_name: { eventId, name } },
      });
      if (existing) throw new ChatRoomExistsError();
      const count = await transaction.chatRoom.count({
        where: { eventId, archivedAt: null },
      });
      if (count >= 20) return null;
      return transaction.chatRoom.create({
        data: { eventId, name, createdBy },
      });
    });
  }
  archiveRoom(id: string) {
    return prisma.chatRoom.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }
  async messages(roomId: string, before?: string) {
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
  async send(roomId: string, eventId: string, senderId: string, body: string) {
    return prisma.$transaction(async (transaction) => {
      const rooms = await transaction.$queryRaw<
        { eventId: string; archivedAt: Date | null }[]
      >`SELECT "eventId", "archivedAt" FROM "chat_room" WHERE "id" = ${roomId}::uuid FOR UPDATE`;
      if (rooms[0]?.eventId !== eventId || rooms[0].archivedAt)
        throw new ResourceNotFoundError();
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${senderId}))`;
      const recent = await transaction.chatMessage.count({
        where: { senderId, createdAt: { gte: new Date(Date.now() - 60_000) } },
      });
      if (recent >= 30) throw new MessageRateLimitError();
      return transaction.chatMessage.create({
        data: { roomId, eventId, senderId, body },
      });
    });
  }
  userNames(ids: string[]) {
    return prisma.userProjection.findMany({ where: { id: { in: ids } } });
  }
}
