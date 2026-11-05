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
import type { ChatProjectionRepository } from '../repositories/ChatProjectionRepository.js';

const topics = [
  EVENT_TOPICS.identity,
  EVENT_TOPICS.events,
  EVENT_TOPICS.participation,
];
const supported = new Set<string>([
  EVENT_TYPES.userRegistered,
  EVENT_TYPES.userNameUpdated,
  EVENT_TYPES.eventCreated,
  EVENT_TYPES.eventUpdated,
  EVENT_TYPES.eventCancelled,
  EVENT_TYPES.userJoined,
  EVENT_TYPES.userLeft,
]);

export class ChatEventConsumer {
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
    private readonly repository: ChatProjectionRepository,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-messages',
      brokers,
    }).createConsumer('event-sharing-messages-v1');
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
      const result = supported.has(event.eventType)
        ? await this.repository.apply(event)
        : 'ignored';
      EventTrace.received('Messages', topic, event, result);
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
      console.error('Messages consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    for (const topic of topics)
      await this.consumer.subscribe({ topic, fromBeginning: true });
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
    this.recovering = this.privacy.recover(() =>
      this.repository.recoverPending(),
    );
    try {
      await this.recovering;
    } catch (error) {
      console.error('Pending chat snapshot recovery failed.', error);
    } finally {
      this.recovering = undefined;
    }
  }
}
