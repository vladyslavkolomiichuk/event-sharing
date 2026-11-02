import type { EventLogRepository } from '../repositories/EventLogRepository.js';

export class EventLogRetentionWorker {
  private interval?: NodeJS.Timeout;

  constructor(
    private readonly repository: EventLogRepository,
    private readonly retentionDays: number,
  ) {}

  start(): void {
    void this.run();
    this.interval = setInterval(() => void this.run(), 86_400_000);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  private async run(): Promise<void> {
    try {
      const count = await this.repository.deleteExpired(this.retentionDays);
      if (count) console.info(`Event Log removed ${count} expired entries.`);
    } catch (error) {
      console.error(
        'Event Log retention failed.',
        error instanceof Error ? error.name : 'UnknownError',
      );
    }
  }
}
