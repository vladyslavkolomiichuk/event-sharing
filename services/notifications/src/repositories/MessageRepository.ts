import { prisma } from '../database/client.js';

export class MessageRepository {
  async send(
    senderId: string,
    eventId: string,
    body: string,
    recipients: string[],
    title: string,
  ) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${senderId}))`;
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const sentToday = await transaction.inAppMessage.count({
        where: { senderId, createdAt: { gte: dayStart } },
      });
      if (sentToday >= 50) return null;
      const message = await transaction.inAppMessage.create({
        data: { senderId, eventId, body, recipientCount: recipients.length },
      });
      await transaction.inAppNotification.createMany({
        data: recipients.map((recipientId) => ({
          recipientId,
          type: 'EVENT_MESSAGE',
          title,
          body: body.length > 180 ? `${body.slice(0, 177)}...` : body,
          href: `/notifications?message=${message.id}`,
          senderId,
          eventId,
          messageId: message.id,
        })),
      });
      return message;
    });
  }

  find(id: string) {
    return prisma.inAppMessage.findUnique({ where: { id } });
  }

  canRead(id: string, userId: string) {
    return prisma.inAppNotification.findFirst({
      where: { messageId: id, recipientId: userId },
      select: { id: true },
    });
  }
}
