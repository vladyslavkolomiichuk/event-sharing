import { EVENT_ROUTES, type EventEnvelope } from '@event-sharing/contracts';
import {
  PrivacyEventGuard,
  OrderedEventProcessor,
} from '@event-sharing/messaging';
import { env } from '../config/env.js';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  UserRegisteredPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserUsernameUpdatedPayloadSchema,
  UserRoleChangedPayloadSchema,
  OrganizerRequestSubmittedPayloadSchema,
  OrganizerRequestResolvedPayloadSchema,
} from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { UserProfileRepository } from '../repositories/UserProfileRepository.js';

export class IdentityEventConsumer {
  private readonly privacy = new PrivacyEventGuard(env.DATABASE_URL);
  private readonly ordered = new OrderedEventProcessor(
    env.DATABASE_URL,
    (event) => this.apply(event),
  );
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
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      if (!payload.restart) this.running = false;
    });
  }

  async start(): Promise<void> {
    this.ordered.start();
    this.interval = setInterval(() => void this.connect(), 5000);
    void this.connect();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    if (this.running) await this.consumer.disconnect();
    await this.ordered.close();
    await this.privacy.close();
  }

  private apply(event: EventEnvelope): Promise<unknown> {
    const topic = EVENT_ROUTES[event.eventType].topic;
    return this.privacy.run(event, async (event) => {
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
          payload.username,
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

      if (event.eventType === EVENT_TYPES.userUsernameUpdated) {
        const payload = UserUsernameUpdatedPayloadSchema.parse(event.payload);
        const changed = await this.repository.updateUsername(
          event.eventId,
          payload.userId,
          payload.username,
          event.eventType,
          payload.name,
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

      if (event.eventType === EVENT_TYPES.organizerRequestSubmitted) {
        OrganizerRequestSubmittedPayloadSchema.parse(event.payload);
        EventTrace.received('Users', EVENT_TOPICS.identity, event, 'ignored');
        return;
      }

      if (event.eventType === EVENT_TYPES.organizerRequestResolved) {
        OrganizerRequestResolvedPayloadSchema.parse(event.payload);
        EventTrace.received('Users', EVENT_TOPICS.identity, event, 'ignored');
        return;
      }

      throw new Error(`Unsupported identity event type: ${event.eventType}`);
    });
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
        const decoded = EventCodec.decode(message.value, EVENT_TOPICS.identity);
        await this.ordered.run(decoded);
      },
    });
  }
}
