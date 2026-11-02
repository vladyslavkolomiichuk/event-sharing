import type { Producer } from 'kafkajs';
import {
  KafkaClientFactory,
  type KafkaConnectionSettings,
} from './KafkaClientFactory.js';
import { PostgresOutboxLock } from './PostgresOutboxLock.js';

export abstract class AbstractOutboxWorker<Event> {
  protected readonly producer: Producer;
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  private connected = false;
  private readonly lock?: PostgresOutboxLock;

  protected constructor(
    settings: KafkaConnectionSettings & {
      databaseUrl?: string;
      lockName?: string;
    },
  ) {
    this.producer = new KafkaClientFactory(settings).createProducer();
    if (settings.databaseUrl && settings.lockName) {
      this.lock = new PostgresOutboxLock(
        settings.databaseUrl,
        settings.lockName,
      );
    }
  }

  async start(): Promise<void> {
    this.interval = setInterval(() => void this.flush(), 1000);
    void this.flush();
  }

  async stop(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    if (this.connected) await this.producer.disconnect();
    await this.lock?.close();
  }

  protected abstract loadPending(): Promise<Event[]>;
  protected abstract publishEvent(event: Event): Promise<void>;

  private async flush(): Promise<void> {
    if (this.pending) return;

    this.pending = this.publishBatch();
    try {
      await this.pending;
    } catch (error) {
      console.error('Outbox delivery failed.', error);
    } finally {
      this.pending = undefined;
    }
  }

  private async publishBatch(): Promise<void> {
    if (!this.connected) {
      await this.producer.connect();
      this.connected = true;
    }

    const publish = async () => {
      for (const event of await this.loadPending()) {
        await this.publishEvent(event);
      }
    };
    if (this.lock) await this.lock.run(publish);
    else await publish();
  }
}
