import {
  EVENT_TOPICS,
  EVENT_TYPES,
  UserRegisteredPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserRoleChangedPayloadSchema,
} from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { UserProfileRepository } from '../repositories/UserProfileRepository.js';

export class IdentityEventConsumer {
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly repository: UserProfileRepository,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-users',
      brokers,
    }).createConsumer('event-sharing-users-identity-v1');
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
      console.error('Identity consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: EVENT_TOPICS.identity,
      fromBeginning: true,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const event = EventCodec.decode(message.value, EVENT_TOPICS.identity);
        if (event.producer !== 'auth' || event.eventVersion !== 1) {
          throw new Error('Unsupported identity event envelope.');
        }

        if (event.eventType === EVENT_TYPES.userRegistered) {
          const payload = UserRegisteredPayloadSchema.parse(event.payload);
          const created = await this.repository.provision(
            event.eventId,
            payload.userId,
            event.eventType,
            payload.name,
          );
          EventTrace.received(
            'Users',
            EVENT_TOPICS.identity,
            event,
            created ? 'processed' : 'duplicate',
          );
          return;
        }

        if (event.eventType === EVENT_TYPES.userNameUpdated) {
          const payload = UserNameUpdatedPayloadSchema.parse(event.payload);
          const changed = await this.repository.updateName(
            event.eventId,
            payload.userId,
            payload.name,
            event.eventType,
          );
          EventTrace.received(
            'Users',
            EVENT_TOPICS.identity,
            event,
            changed ? 'processed' : 'duplicate',
          );
          return;
        }

        if (event.eventType === EVENT_TYPES.userRoleChanged) {
          UserRoleChangedPayloadSchema.parse(event.payload);
          EventTrace.received('Users', EVENT_TOPICS.identity, event, 'ignored');
          return;
        }

        throw new Error(`Unsupported identity event type: ${event.eventType}`);
      },
    });
  }
}
