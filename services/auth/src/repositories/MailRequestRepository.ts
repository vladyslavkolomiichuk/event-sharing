import {
  EVENT_TYPES,
  type NotificationRequestedPayload,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class MailRequestRepository {
  async enqueue(
    userId: string,
    payload: NotificationRequestedPayload,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`privacy-auth:${userId}`}, 0))`;
      if (
        await transaction.privacyDeletionJob.findFirst({
          where: { userId, frozenAt: { not: null } },
        })
      )
        return;
      await transaction.outboxEvent.create({
        data: {
          aggregateId: userId,
          eventType: EVENT_TYPES.notificationRequested,
          payload,
        },
      });
    });
  }
}
