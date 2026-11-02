import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  UserRegisteredPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserUsernameUpdatedPayloadSchema,
  UserRoleChangedPayloadSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type IdentityOutboxEvent = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class IdentityOutboxWorker extends AbstractOutboxWorker<IdentityOutboxEvent> {
  constructor(brokers: string[]) {
    super({
      clientId: 'event-sharing-auth',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'auth-identity',
    });
  }

  protected loadPending(): Promise<IdentityOutboxEvent[]> {
    return prisma.outboxEvent.findMany({
      where: {
        eventType: {
          in: [
            EVENT_TYPES.userRegistered,
            EVENT_TYPES.userNameUpdated,
            EVENT_TYPES.userUsernameUpdated,
            EVENT_TYPES.userRoleChanged,
          ],
        },
        publishedAt: null,
      },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(event: IdentityOutboxEvent): Promise<void> {
    let payload: unknown;
    if (event.eventType === EVENT_TYPES.userRegistered) {
      payload = UserRegisteredPayloadSchema.parse(event.payload);
    } else if (event.eventType === EVENT_TYPES.userNameUpdated) {
      payload = UserNameUpdatedPayloadSchema.parse(event.payload);
    } else if (event.eventType === EVENT_TYPES.userUsernameUpdated) {
      payload = UserUsernameUpdatedPayloadSchema.parse(event.payload);
    } else if (event.eventType === EVENT_TYPES.userRoleChanged) {
      payload = UserRoleChangedPayloadSchema.parse(event.payload);
    } else {
      throw new Error(`Unsupported identity event type: ${event.eventType}`);
    }

    const envelope = EventEnvelopeSchema.parse({
      eventId: event.id,
      eventType: event.eventType,
      eventVersion: 1,
      occurredAt: event.occurredAt.toISOString(),
      correlationId: event.id,
      producer: 'auth',
      payload,
    });

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { attempts: { increment: 1 } },
    });

    await this.producer.send({
      topic: EVENT_TOPICS.identity,
      acks: -1,
      messages: [
        {
          key: event.aggregateId,
          value: EventCodec.encode(envelope, EVENT_TOPICS.identity),
        },
      ],
    });

    EventTrace.sent('Auth', EVENT_TOPICS.identity, envelope);

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  }
}
