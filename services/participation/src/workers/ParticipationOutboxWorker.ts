import {
  EVENT_TOPICS,
  EVENT_TYPES,
  EventEnvelopeSchema,
  MembershipEventPayloadSchema,
  RegistrationPolicyAppliedPayloadSchema,
  RegistrationPolicyRejectedPayloadSchema,
} from '@event-sharing/contracts';
import {
  AbstractOutboxWorker,
  EventCodec,
  EventTrace,
} from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { env } from '../config/env.js';

type ParticipationOutboxEvent = Awaited<
  ReturnType<typeof prisma.outboxEvent.findMany>
>[number];

export class ParticipationOutboxWorker extends AbstractOutboxWorker<ParticipationOutboxEvent> {
  constructor(
    brokers: string[],
    private readonly topic: string = EVENT_TOPICS.participation,
  ) {
    super({
      clientId: 'event-sharing-participation-outbox',
      brokers,
      databaseUrl: env.DATABASE_URL,
      lockName: 'participation',
    });
  }

  protected loadPending(): Promise<ParticipationOutboxEvent[]> {
    return prisma.outboxEvent.findMany({
      where: { publishedAt: null },
      orderBy: { position: 'asc' },
      take: 100,
    });
  }

  protected async publishEvent(event: ParticipationOutboxEvent): Promise<void> {
    let payload: unknown;
    if (event.eventType === EVENT_TYPES.registrationPolicyApplied) {
      payload = RegistrationPolicyAppliedPayloadSchema.parse(event.payload);
    } else if (event.eventType === EVENT_TYPES.registrationPolicyRejected) {
      payload = RegistrationPolicyRejectedPayloadSchema.parse(event.payload);
    } else if (
      event.eventType === EVENT_TYPES.userJoined ||
      event.eventType === EVENT_TYPES.userLeft
    ) {
      payload = MembershipEventPayloadSchema.parse(event.payload);
    } else {
      throw new Error(`Unsupported participation event: ${event.eventType}`);
    }

    const envelope = EventEnvelopeSchema.parse({
      eventId: event.id,
      eventType: event.eventType,
      eventVersion: 1,
      occurredAt: event.occurredAt.toISOString(),
      correlationId: event.id,
      producer: 'participation',
      payload,
    });

    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { attempts: { increment: 1 } },
    });
    await this.producer.send({
      topic: this.topic,
      acks: -1,
      messages: [
        {
          key: event.aggregateId,
          value: EventCodec.encode(envelope, this.topic),
        },
      ],
    });
    EventTrace.sent('Participation', this.topic, envelope);
    await prisma.outboxEvent.update({
      where: { id: event.id },
      data: { publishedAt: new Date() },
    });
  }
}
