import { PrivacyEventGuard } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  NotificationRequestedPayloadSchema,
} from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { EmailDeliveryRepository } from '../repositories/EmailDeliveryRepository.js';

export class AuthMailConsumer {
  private readonly privacy = new PrivacyEventGuard(env.DATABASE_URL);
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly repository: EmailDeliveryRepository,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-notifications-mail',
      brokers,
    }).createConsumer('event-sharing-notifications-mail-v1');
    this.consumer.on(this.consumer.events.CRASH, ({ payload }) => {
      if (!payload.restart) this.running = false;
    });
  }

  async start(): Promise<void> {
    this.interval = setInterval(() => void this.connect(), 5000);
    void this.connect();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    if (this.running) await this.consumer.disconnect();
    await this.privacy.close();
  }

  private async connect(): Promise<void> {
    if (this.running || this.pending) return;
    this.pending = this.connectAndRun();
    try {
      await this.pending;
      this.running = true;
    } catch (error) {
      console.error('Mail consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: EVENT_TOPICS.notifications,
      fromBeginning: true,
    });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        const decoded = EventCodec.decode(
          message.value,
          EVENT_TOPICS.notifications,
        );
        await this.privacy.run(decoded, async (event) => {
          if (
            event.producer !== 'auth' ||
            event.eventType !== EVENT_TYPES.notificationRequested
          ) {
            EventTrace.received(
              'Notifications',
              EVENT_TOPICS.notifications,
              event,
              'ignored',
            );
            return;
          }
          if (event.eventVersion !== 1) {
            throw new Error('Unsupported mail event version.');
          }
          const payload = NotificationRequestedPayloadSchema.parse(
            event.payload,
          );
          const result = await this.repository.accept(
            event.eventId,
            event.eventType,
            payload,
          );
          EventTrace.received(
            'Notifications',
            EVENT_TOPICS.notifications,
            event,
            result,
          );
        });
      },
    });
  }
}
