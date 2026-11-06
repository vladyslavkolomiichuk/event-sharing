import { EVENT_ROUTES, type EventEnvelope } from '@event-sharing/contracts';
import {
  PrivacyEventGuard,
  OrderedEventProcessor,
} from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { EVENT_TOPICS, EVENT_TYPES } from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { NotificationEventService } from '../services/NotificationEventService.js';

const topics = [
  EVENT_TOPICS.identity,
  EVENT_TOPICS.users,
  EVENT_TOPICS.events,
  EVENT_TOPICS.participation,
  EVENT_TOPICS.messages,
];

// Research control: joins arrive over HTTP, so Kafka must not recover lost ones.
const ignoredTypes = new Set<string>([EVENT_TYPES.userJoined]);
const supportedTypes = new Set<string>([
  EVENT_TYPES.userRegistered,
  EVENT_TYPES.userRoleChanged,
  EVENT_TYPES.organizerRequestSubmitted,
  EVENT_TYPES.organizerRequestResolved,
  EVENT_TYPES.userNameUpdated,
  EVENT_TYPES.userProfileUpdated,
  EVENT_TYPES.friendRequested,
  EVENT_TYPES.friendAccepted,
  EVENT_TYPES.invitationSent,
  EVENT_TYPES.eventCreated,
  EVENT_TYPES.eventUpdated,
  EVENT_TYPES.eventCancelled,
  EVENT_TYPES.userJoined,
  EVENT_TYPES.userLeft,
  EVENT_TYPES.chatMembershipChanged,
  EVENT_TYPES.chatMessageCreated,
]);

export class DomainEventConsumer {
  private readonly privacy = new PrivacyEventGuard(env.DATABASE_URL);
  private readonly ordered = new OrderedEventProcessor(
    env.DATABASE_URL,
    (event) => this.apply(event),
  );
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private recovering: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly service: NotificationEventService,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-notifications-domain',
      brokers,
    }).createConsumer('event-sharing-notifications-domain-v1');
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
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    await this.pending;
    await this.recovering;
    if (this.running) await this.consumer.disconnect();
    await this.ordered.close();
    await this.privacy.close();
  }

  private apply(event: EventEnvelope): Promise<unknown> {
    const topic = EVENT_ROUTES[event.eventType].topic;
    return this.privacy.run(event, async (event) => {
      if (!supportedTypes.has(event.eventType) || ignoredTypes.has(event.eventType)) {
        EventTrace.received('Notifications', topic, event, 'ignored');
        return;
      }
      const result = await this.service.apply(event);
      EventTrace.received('Notifications', topic, event, result);
      return result;
    });
  }

  private async connect(): Promise<void> {
    if (this.running || this.pending) return;
    this.pending = this.connectAndRun();
    try {
      await this.pending;
      this.running = true;
    } catch (error) {
      console.error('Notification domain consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    for (const topic of topics) {
      await this.consumer.subscribe({ topic, fromBeginning: true });
    }
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const decoded = EventCodec.decode(message.value, topic);
        await this.ordered.run(decoded);
      },
    });
    if (this.recoveryInterval) clearInterval(this.recoveryInterval);
    this.recoveryInterval = setInterval(() => void this.recover(), 5000);
    void this.recover();
  }

  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = this.privacy.recover(() => this.service.recoverPending());
    try {
      await this.recovering;
    } catch (error) {
      console.error('Pending event snapshot recovery failed.', error);
    } finally {
      this.recovering = undefined;
    }
  }
}
