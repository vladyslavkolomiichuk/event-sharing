import { randomUUID } from 'node:crypto';
import {
  EVENT_TOPICS,
  EVENT_TYPES,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { describe, expect, it, vi } from 'vitest';
import { EventCodec, EventTrace, ServiceRpcError } from '../src/index.js';

const envelope = (overrides: Partial<EventEnvelope> = {}): EventEnvelope => ({
  eventId: randomUUID(),
  eventType: EVENT_TYPES.eventCreated,
  eventVersion: 1,
  occurredAt: new Date().toISOString(),
  correlationId: randomUUID(),
  producer: 'events',
  payload: { id: randomUUID() },
  ...overrides,
});

describe('EventCodec', () => {
  it('encodes and decodes a routed event', () => {
    const event = envelope();
    const encoded = EventCodec.encode(event, EVENT_TOPICS.events);
    expect(
      EventCodec.decode(Buffer.from(encoded), EVENT_TOPICS.events),
    ).toEqual(event);
  });

  it('rejects an unexpected producer', () => {
    expect(() => EventCodec.encode(envelope({ producer: 'users' }))).toThrow(
      /Unexpected producer/,
    );
  });

  it('rejects a known topic that does not match the route', () => {
    expect(() => EventCodec.encode(envelope(), EVENT_TOPICS.users)).toThrow(
      /Unexpected topic/,
    );
  });

  it('allows unknown topics such as retries', () => {
    expect(() => EventCodec.encode(envelope(), 'custom.retry')).not.toThrow();
  });

  it('rejects a missing value and invalid JSON', () => {
    expect(() => EventCodec.decode(null)).toThrow(
      'Kafka event value is missing.',
    );
    expect(() => EventCodec.decode('{')).toThrow(SyntaxError);
  });
});

describe('EventTrace', () => {
  it('logs sent and received events', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const event = envelope();
    EventTrace.sent('events', 'topic', event);
    EventTrace.received('search', 'topic', event, 'applied');
    expect(info.mock.calls[0]?.[0]).toContain('[EVENT SENT] events -> topic');
    expect(info.mock.calls[1]?.[0]).toContain('result=applied');
  });
});

describe('ServiceRpcError', () => {
  it('defaults to service unavailable', () => {
    const error = new ServiceRpcError('Down.');
    expect([error.code, error.statusCode]).toEqual([
      'SERVICE_UNAVAILABLE',
      503,
    ]);
  });
});
