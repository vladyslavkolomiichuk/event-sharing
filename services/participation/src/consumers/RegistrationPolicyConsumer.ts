import {
  EVENT_TOPICS,
  EVENT_TYPES,
  RegistrationPolicyRequestedPayloadSchema,
} from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { RegistrationPolicyRepository } from '../repositories/RegistrationPolicyRepository.js';

export class RegistrationPolicyConsumer {
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private recovering: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly policies: RegistrationPolicyRepository,
    private readonly topic: string = EVENT_TOPICS.events,
    groupId = 'event-sharing-participation-policies-v1',
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-participation',
      brokers,
    }).createConsumer(groupId);
  }

  async start(): Promise<void> {
    this.interval = setInterval(() => void this.connect(), 5000);
    void this.connect();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    await this.pending;
    await this.recovering;
    if (this.running) await this.consumer.disconnect();
  }

  private async connect(): Promise<void> {
    if (this.running || this.pending) return;
    this.pending = this.connectAndRun();
    try {
      await this.pending;
      this.running = true;
    } catch (error) {
      console.error('Registration policy consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: this.topic,
      fromBeginning: true,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = EventCodec.decode(message.value, this.topic);
        if (event.producer !== 'events' || event.eventVersion !== 1) {
          throw new Error('Unsupported events topic envelope.');
        }
        if (event.eventType !== EVENT_TYPES.registrationPolicyRequested) {
          EventTrace.received('Participation', this.topic, event, 'ignored');
          return;
        }
        const payload = RegistrationPolicyRequestedPayloadSchema.parse(
          event.payload,
        );
        const result = await this.policies.apply(event.eventId, payload);
        EventTrace.received('Participation', this.topic, event, result);
      },
    });
    this.recoveryInterval = setInterval(() => void this.recover(), 5000);
    void this.recover();
  }

  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = this.policies.recoverPending();
    try {
      await this.recovering;
    } catch (error) {
      console.error('Pending registration policy recovery failed.', error);
    } finally {
      this.recovering = undefined;
    }
  }
}
