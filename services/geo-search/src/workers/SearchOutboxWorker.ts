import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  SearchPerformedPayloadSchema,
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

export class SearchOutboxWorker extends AbstractOutboxWorker<OutboxRecord> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-geo-search-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'geo-search',
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
    if (record.eventType !== EVENT_TYPES.searchPerformed)
      throw new Error(`Unsupported search event: ${record.eventType}`);
    const envelope = EventEnvelopeSchema.parse({
      eventId: record.id,
      eventType: record.eventType,
      eventVersion: 1,
      occurredAt: record.occurredAt.toISOString(),
      correlationId: record.id,
      producer: 'geo-search',
      payload: SearchPerformedPayloadSchema.parse(record.payload),
    });
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: EVENT_TOPICS.search,
      acks: -1,
      messages: [
        {
          key: record.id,
          value: EventCodec.encode(envelope, EVENT_TOPICS.search),
        },
      ],
    });
    EventTrace.sent('Geo Search', EVENT_TOPICS.search, envelope);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() },
    });
  }
}
