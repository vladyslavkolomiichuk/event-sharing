import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  NotificationRequestedPayloadSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type MailOutboxEvent = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class AuthMailOutboxWorker extends AbstractOutboxWorker<MailOutboxEvent> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-auth-mail',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'auth-mail',
    });
  }

  protected loadPending(): Promise<MailOutboxEvent[]> {
    return prisma.outboxEvent.findMany({
      where: {
        eventType: EVENT_TYPES.notificationRequested,
        publishedAt: null,
      },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(record: MailOutboxEvent): Promise<void> {
    const envelope = EventEnvelopeSchema.parse({
      eventId: record.id,
      eventType: record.eventType,
      eventVersion: 1,
      occurredAt: record.occurredAt.toISOString(),
      correlationId: record.id,
      producer: 'auth',
      payload: NotificationRequestedPayloadSchema.parse(record.payload),
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
    EventTrace.sent('Auth', EVENT_TOPICS.notifications, envelope);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() },
    });
  }
}
