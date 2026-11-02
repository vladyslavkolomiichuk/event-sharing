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
];

const supportedTypes = new Set<string>([
  EVENT_TYPES.userRegistered,
  EVENT_TYPES.userRoleChanged,
  EVENT_TYPES.userNameUpdated,
  EVENT_TYPES.userProfileUpdated,
  EVENT_TYPES.eventCreated,
  EVENT_TYPES.eventUpdated,
  EVENT_TYPES.eventCancelled,
  EVENT_TYPES.userJoined,
  EVENT_TYPES.userLeft,
]);

export class DomainEventConsumer {
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
        const event = EventCodec.decode(message.value, topic);
        if (!supportedTypes.has(event.eventType)) {
          EventTrace.received('Notifications', topic, event, 'ignored');
          return;
        }
        const result = await this.service.apply(event);
        EventTrace.received('Notifications', topic, event, result);
      },
    });
    this.recoveryInterval = setInterval(() => void this.recover(), 5000);
    void this.recover();
  }

  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = this.service.recoverPending();
    try {
      await this.recovering;
    } catch (error) {
      console.error('Pending event snapshot recovery failed.', error);
    } finally {
      this.recovering = undefined;
    }
  }
}
