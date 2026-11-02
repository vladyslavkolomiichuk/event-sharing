import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  EventSnapshotPayloadSchema,
  RegistrationPolicyRequestedPayloadSchema,
  isEventSnapshotType,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type EventOutboxRecord = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class EventOutboxWorker extends AbstractOutboxWorker<EventOutboxRecord> {
  constructor(
    brokers: string[],
    private readonly topic: string = EVENT_TOPICS.events,
  ) {
    super({
      clientId: 'event-sharing-events-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'events',
    });
  }

  protected loadPending(): Promise<EventOutboxRecord[]> {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(record: EventOutboxRecord): Promise<void> {
    let payload: unknown;
    if (record.eventType === EVENT_TYPES.registrationPolicyRequested) {
      payload = RegistrationPolicyRequestedPayloadSchema.parse(record.payload);
    } else if (isEventSnapshotType(record.eventType)) {
      payload = EventSnapshotPayloadSchema.parse(record.payload);
    } else {
      throw new Error(`Unsupported Events event: ${record.eventType}`);
    }
    const envelope = EventEnvelopeSchema.parse({
      eventId: record.id,
      eventType: record.eventType,
      eventVersion: 1,
      occurredAt: record.occurredAt.toISOString(),
      correlationId: record.id,
      producer: 'events',
      payload,
    });
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: this.topic,
      acks: -1,
      messages: [
        {
          key: record.aggregateId,
          value: EventCodec.encode(envelope, this.topic),
        },
      ],
    });
    EventTrace.sent('Events', this.topic, envelope);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() },
    });
  }
}
