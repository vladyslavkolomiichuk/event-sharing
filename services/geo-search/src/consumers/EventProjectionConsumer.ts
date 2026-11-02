import { EVENT_TOPICS } from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { SearchProjectionRepository } from '../repositories/SearchProjectionRepository.js';

export class EventProjectionConsumer {
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private recoveryInterval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private recovering: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly repository: SearchProjectionRepository,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-geo-search',
      brokers,
    }).createConsumer('event-sharing-geo-search-v1');
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
      console.error('Geo Search consumer connection failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topic: EVENT_TOPICS.events,
      fromBeginning: true,
    });
    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const event = EventCodec.decode(message.value, topic);
        const result = await this.repository.apply(event);
        EventTrace.received('Geo Search', topic, event, result);
      },
    });
    this.recoveryInterval = setInterval(() => void this.recover(), 5000);
    void this.recover();
  }

  private async recover(): Promise<void> {
    if (this.recovering) return;
    this.recovering = this.repository.recoverPending();
    try {
      await this.recovering;
    } catch (error) {
      console.error('Pending search snapshot recovery failed.', error);
    } finally {
      this.recovering = undefined;
    }
  }
}
