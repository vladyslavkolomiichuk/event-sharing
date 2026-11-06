import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  MembershipEventPayloadSchema,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';

// Research control only: waits for Notifications, once, with no retries.
export class NotificationHttpClient {
  async notifyJoined(membershipEventId: string): Promise<void> {
    try {
      const event = await prisma.outboxEvent.findUniqueOrThrow({
        where: { id: membershipEventId },
      });
      const envelope = EventEnvelopeSchema.parse({
        eventId: event.id,
        eventType: EVENT_TYPES.userJoined,
        eventVersion: 1,
        occurredAt: event.occurredAt.toISOString(),
        correlationId: event.id,
        producer: 'participation',
        payload: MembershipEventPayloadSchema.parse(event.payload),
      });
      await fetch(`${env.NOTIFICATIONS_SERVICE_URL}/internal/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(envelope),
        signal: AbortSignal.timeout(2000),
      });
    } catch (error) {
      console.error('Synchronous notification failed.', error);
    }
  }
}
