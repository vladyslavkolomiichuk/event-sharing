import {
  EventEnvelopeSchema,
  EVENT_ROUTES,
  EVENT_TOPICS,
  type EventEnvelope,
} from '@event-sharing/contracts';

export class EventCodec {
  static encode(event: EventEnvelope, topic?: string): string {
    const parsed = EventEnvelopeSchema.parse(event);
    this.assertRoute(parsed, topic);
    return JSON.stringify(parsed);
  }

  static decode(value: Buffer | string | null, topic?: string): EventEnvelope {
    if (!value) {
      throw new Error('Kafka event value is missing.');
    }

    const event = EventEnvelopeSchema.parse(
      JSON.parse(value.toString()) as unknown,
    );
    this.assertRoute(event, topic);
    return event;
  }

  private static assertRoute(event: EventEnvelope, topic?: string): void {
    const route = EVENT_ROUTES[event.eventType];
    if (event.producer !== route.producer) {
      throw new Error(`Unexpected producer for ${event.eventType}.`);
    }
    if (
      topic &&
      Object.values(EVENT_TOPICS).some((value) => value === topic) &&
      topic !== route.topic
    ) {
      throw new Error(`Unexpected topic for ${event.eventType}.`);
    }
  }
}
