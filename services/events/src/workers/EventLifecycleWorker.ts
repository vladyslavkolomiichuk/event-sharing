import { EventRepository } from '../repositories/EventRepository.js';

export class EventLifecycleWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly events = new EventRepository()) {}

  start(): void {
    void this.tick();
    this.timer = setInterval(() => void this.tick(), 10_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.events.advanceDueEvents();
    } catch (error) {
      console.error('Could not advance due events.', error);
    } finally {
      this.running = false;
    }
  }
}
