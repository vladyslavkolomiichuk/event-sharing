import {
  EVENT_TOPICS,
  EventEnvelopeSchema,
  NotificationDeliveryPayloadSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type OutboxRecord = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class NotificationOutboxWorker extends AbstractOutboxWorker<OutboxRecord> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-notifications-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'notifications',
    });
  }

  protected loadPending(): Promise<OutboxRecord[]> {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(record: OutboxRecord): Promise<void> {
    const envelope = EventEnvelopeSchema.parse({
      eventId: record.id,
      eventType: record.eventType,
      eventVersion: 1,
      occurredAt: record.occurredAt.toISOString(),
      correlationId: record.aggregateId,
      producer: 'notifications',
      payload: NotificationDeliveryPayloadSchema.parse(record.payload),
    });
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: EVENT_TOPICS.notifications,
      acks: -1,
      messages: [
        {
          key: record.aggregateId,
          value: EventCodec.encode(envelope, EVENT_TOPICS.notifications),
        },
      ],
    });
    EventTrace.sent('Notifications', EVENT_TOPICS.notifications, envelope);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() },
    });
  }
}
