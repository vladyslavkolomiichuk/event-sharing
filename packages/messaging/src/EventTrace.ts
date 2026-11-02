import type { EventEnvelope } from '@event-sharing/contracts';

export class EventTrace {
  static sent(service: string, topic: string, event: EventEnvelope): void {
    console.info(
      `[EVENT SENT] ${service} -> ${topic} | type=${event.eventType} | id=${event.eventId}`,
    );
  }

  static received(
    service: string,
    topic: string,
    event: EventEnvelope,
    result:
      | 'processed'
      | 'applied'
      | 'rejected'
      | 'duplicate'
      | 'ignored'
      | 'pending',
  ): void {
    console.info(
      `[EVENT RECEIVED] ${event.producer} -> ${service} | topic=${topic} | type=${event.eventType} | id=${event.eventId} | result=${result}`,
    );
  }
}
