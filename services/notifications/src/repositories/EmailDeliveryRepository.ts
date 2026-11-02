import {
  EVENT_TYPES,
  NotificationDeliveryPayloadSchema,
  NotificationRequestedPayloadSchema,
  type NotificationRequestedPayload,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class EmailDeliveryRepository {
  async accept(
    eventId: string,
    eventType: typeof EVENT_TYPES.notificationRequested,
    payload: NotificationRequestedPayload,
  ): Promise<'processed' | 'duplicate'> {
    const request = NotificationRequestedPayloadSchema.parse(payload);
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: eventId, eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return 'duplicate';
      await transaction.emailDelivery.create({
        data: {
          id: eventId,
          payload: request,
          expiresAt: new Date(request.expiresAt),
        },
      });
      return 'processed';
    });
  }

  listDue() {
    return prisma.emailDelivery.findMany({
      where: {
        status: { in: ['PENDING', 'RETRY'] },
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
    });
  }

  async markSent(id: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.emailDelivery.updateMany({
        where: { id, status: { in: ['PENDING', 'RETRY'] } },
        data: {
          status: 'SENT',
          attempts: { increment: 1 },
          sentAt: new Date(),
          lastError: null,
        },
      });
      if (result.count === 0) return;
      await transaction.outboxEvent.create({
        data: {
          aggregateId: id,
          eventType: EVENT_TYPES.notificationSent,
          payload: NotificationDeliveryPayloadSchema.parse({
            requestId: id,
            channel: 'EMAIL',
          }),
        },
      });
    });
  }

  async markFailed(
    id: string,
    attempts: number,
    expired: boolean,
  ): Promise<void> {
    const terminal = expired || attempts >= 5;
    const delay = Math.min(60_000 * 2 ** (attempts - 1), 15 * 60_000);
    await prisma.$transaction(async (transaction) => {
      const result = await transaction.emailDelivery.updateMany({
        where: { id, status: { in: ['PENDING', 'RETRY'] } },
        data: {
          status: terminal ? 'FAILED' : 'RETRY',
          attempts,
          nextAttemptAt: new Date(Date.now() + delay),
          lastError: expired ? 'Request expired.' : 'SMTP delivery failed.',
        },
      });
      if (terminal && result.count === 1) {
        await transaction.outboxEvent.create({
          data: {
            aggregateId: id,
            eventType: EVENT_TYPES.notificationFailed,
            payload: NotificationDeliveryPayloadSchema.parse({
              requestId: id,
              channel: 'EMAIL',
              reason: expired ? 'EXPIRED' : 'DELIVERY_FAILED',
            }),
          },
        });
      }
    });
  }
}
