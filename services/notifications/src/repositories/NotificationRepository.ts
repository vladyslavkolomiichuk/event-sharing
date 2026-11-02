import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';

export type NotificationInput = {
  recipientId: string;
  type: string;
  title: string;
  body: string;
  href: string;
  senderId?: string;
  eventId?: string;
  messageId?: string;
  sourceEventId?: string;
};

export class NotificationRepository {
  async createMany(
    transaction: Prisma.TransactionClient,
    items: NotificationInput[],
  ) {
    if (items.length === 0) return 0;
    const result = await transaction.inAppNotification.createMany({
      data: items,
      skipDuplicates: true,
    });
    return result.count;
  }

  deleteModerationForUser(
    transaction: Prisma.TransactionClient,
    userId: string,
  ) {
    return transaction.inAppNotification.deleteMany({
      where: { recipientId: userId, type: 'EVENT_MODERATION' },
    });
  }

  list(recipientId: string, cursor?: string) {
    return prisma.inAppNotification.findMany({
      where: { recipientId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  unreadCount(recipientId: string) {
    return prisma.inAppNotification.count({
      where: { recipientId, readAt: null },
    });
  }

  markRead(id: string, recipientId: string) {
    return prisma.inAppNotification.updateMany({
      where: { id, recipientId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(recipientId: string) {
    return prisma.inAppNotification.updateMany({
      where: { recipientId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  find(id: string, recipientId: string) {
    return prisma.inAppNotification.findFirst({ where: { id, recipientId } });
  }
}
