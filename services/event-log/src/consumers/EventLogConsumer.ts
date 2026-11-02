import { EVENT_TOPICS } from '@event-sharing/contracts';
import {
  EventCodec,
  EventTrace,
  KafkaClientFactory,
} from '@event-sharing/messaging';
import type { Consumer } from 'kafkajs';
import type { EventLogRepository } from '../repositories/EventLogRepository.js';

export class EventLogConsumer {
  private readonly consumer: Consumer;
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private running = false;

  constructor(
    brokers: string[],
    private readonly repository: EventLogRepository,
    private readonly retentionDays: number,
  ) {
    this.consumer = new KafkaClientFactory({
      clientId: 'event-sharing-event-log',
      brokers,
    }).createConsumer('event-sharing-event-log-v1');
    this.consumer.on(this.consumer.events.CRASH, () => {
      console.error('Event Log Kafka consumer stopped unexpectedly.');
    });
  }

  async start(): Promise<void> {
    this.interval = setInterval(() => void this.connect(), 5000);
    void this.connect();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    await this.consumer.disconnect();
    this.running = false;
  }

  private async connect(): Promise<void> {
    if (this.running || this.pending) return;
    this.pending = this.connectAndRun();
    try {
      await this.pending;
      this.running = true;
    } catch (error) {
      console.error(
        'Event Log Kafka connection failed.',
        error instanceof Error ? error.name : 'UnknownError',
      );
    } finally {
      this.pending = undefined;
    }
  }

  private async connectAndRun(): Promise<void> {
    await this.consumer.connect();
    for (const topic of Object.values(EVENT_TOPICS)) {
      await this.consumer.subscribe({ topic, fromBeginning: true });
    }
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const event = EventCodec.decode(message.value, topic);
        const result = await this.repository.record(
          event,
          topic,
          partition,
          message.offset,
          this.retentionDays,
        );
        EventTrace.received('Event Log', topic, event, result);
      },
    });
  }
}
