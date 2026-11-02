import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  UserProfileUpdatedPayloadSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type ProfileOutboxEvent = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class UserProfileOutboxWorker extends AbstractOutboxWorker<ProfileOutboxEvent> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-users-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'users',
    });
  }

  protected loadPending(): Promise<ProfileOutboxEvent[]> {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(event: ProfileOutboxEvent): Promise<void> {
    if (event.eventType !== EVENT_TYPES.userProfileUpdated) {
      throw new Error(`Unsupported user event type: ${event.eventType}`);
    }

    const envelope = EventEnvelopeSchema.parse({
      eventId: event.id,
      eventType: event.eventType,
      eventVersion: 1,
      occurredAt: event.occurredAt.toISOString(),
      correlationId: event.id,
      producer: 'users',
      payload: UserProfileUpdatedPayloadSchema.parse(event.payload),
    });

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: EVENT_TOPICS.users,
      acks: -1,
      messages: [
        {
          key: event.aggregateId,
          value: EventCodec.encode(envelope, EVENT_TOPICS.users),
        },
      ],
    });
    EventTrace.sent('Users', EVENT_TOPICS.users, envelope);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  }
}
