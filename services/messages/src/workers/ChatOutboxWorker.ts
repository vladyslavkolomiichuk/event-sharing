import {
  ChatMembershipChangedPayloadSchema,
  ChatMessageCreatedPayloadSchema,
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';

type ChatOutboxEvent = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class ChatOutboxWorker extends AbstractOutboxWorker<ChatOutboxEvent> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-messages-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'messages-membership',
    });
  }

  protected loadPending(): Promise<ChatOutboxEvent[]> {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { occurredAt: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(record: ChatOutboxEvent): Promise<void> {
    const payload =
      record.eventType === EVENT_TYPES.chatMembershipChanged
        ? ChatMembershipChangedPayloadSchema.parse(record.payload)
        : record.eventType === EVENT_TYPES.chatMessageCreated
          ? ChatMessageCreatedPayloadSchema.parse(record.payload)
          : null;
    if (!payload)
      throw new Error(`Unsupported Messages event: ${record.eventType}`);
    const envelope = EventEnvelopeSchema.parse({
      eventId: record.id,
      eventType: record.eventType,
      eventVersion: 1,
      occurredAt: record.occurredAt.toISOString(),
      correlationId: record.id,
      producer: 'messages',
      payload,
    });
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: EVENT_TOPICS.messages,
      acks: -1,
      messages: [
        {
          key: record.aggregateId,
          value: EventCodec.encode(envelope, EVENT_TOPICS.messages),
        },
      ],
    });
    EventTrace.sent('Messages', EVENT_TOPICS.messages, envelope);
    await prisma.outboxEvent.update({
      where: { id: record.id },
      data: { publishedAt: new Date() },
    });
  }
}
