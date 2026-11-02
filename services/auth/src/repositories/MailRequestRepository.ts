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
    await prisma.outboxEvent.create({
      data: {
        aggregateId: userId,
        eventType: EVENT_TYPES.notificationRequested,
        payload,
      },
    });
  }
}
