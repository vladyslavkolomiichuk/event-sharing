import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RegistrationPolicyAppliedPayloadSchema,
  RegistrationPolicyRejectedPayloadSchema,
  isMembershipEventType,
} from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { EventRepository } from '../repositories/EventRepository.js';
import type { ParticipantAccessRepository } from '../repositories/ParticipantAccessRepository.js';

export class ParticipationEventConsumer {
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly events: EventRepository,
    private readonly access: ParticipantAccessRepository,
    private readonly topic: string = EVENT_TOPICS.participation,
    groupId = 'event-sharing-events-participation-v1',
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-events',
      brokers,
    }).createConsumer(groupId);
  }

  async start(): Promise<void> {
    this.interval = setInterval(() => void this.connect(), 5000);
    void this.connect();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    if (this.running) await this.consumer.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.running || this.pending) return;
    this.pending = this.connectAndRun();
    try {
      await this.pending;
      this.running = true;
    } catch (error) {
      console.error('Participation event consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.topic, fromBeginning: true });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = EventCodec.decode(message.value, this.topic);
        if (event.producer !== 'participation' || event.eventVersion !== 1) {
          throw new Error('Unsupported participation event envelope.');
        }
        if (event.eventType === EVENT_TYPES.registrationPolicyApplied) {
          const payload = RegistrationPolicyAppliedPayloadSchema.parse(
            event.payload,
          );
          const result = await this.events.applyPolicyResult(
            event.eventId,
            event.eventType,
            payload,
          );
          EventTrace.received('Events', this.topic, event, result);
          return;
        }
        if (event.eventType === EVENT_TYPES.registrationPolicyRejected) {
          const payload = RegistrationPolicyRejectedPayloadSchema.parse(
            event.payload,
          );
          const result = await this.events.applyPolicyResult(
            event.eventId,
            event.eventType,
            payload,
          );
          EventTrace.received('Events', this.topic, event, result);
          return;
        }
        if (isMembershipEventType(event.eventType)) {
          const result = await this.access.apply(
            event.eventId,
            event.eventType,
            event.payload,
          );
          EventTrace.received('Events', this.topic, event, result);
          return;
        }
        EventTrace.received('Events', this.topic, event, 'ignored');
      },
    });
  }
}
