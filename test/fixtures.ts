import { randomUUID } from 'node:crypto';
import type {
  EventDetail,
  EventEnvelope,
  EventType,
} from '@event-sharing/contracts';

export const ids = () => randomUUID();

export function eventDetail(overrides: Partial<EventDetail> = {}): EventDetail {
  const start = new Date(Date.now() + 86400000);
  return {
    id: randomUUID(),
    organizerId: randomUUID(),
    categoryId: null,
    categoryName: null,
    title: 'Jazz night',
    description: 'Live music.',
    startTime: start.toISOString(),
    endTime: new Date(start.getTime() + 7200000).toISOString(),
    timeZone: 'Europe/Kyiv',
    status: 'PUBLISHED',
    registrationStatus: 'OPEN',
    participantLimit: 20,
    chatEnabled: true,
    visibility: 'PUBLIC',
    version: 1,
    pendingStatus: null,
    pendingRegistrationStatus: null,
    pendingParticipantLimit: null,
    policyError: null,
    moderationReason: null,
    cancellationReason: null,
    location: {
      region: 'Kyiv',
      visibility: 'PUBLIC',
      address: 'Khreshchatyk 1',
      latitude: 50.45,
      longitude: 30.52,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function envelope(
  eventType: EventType,
  producer: EventEnvelope['producer'],
  payload: unknown,
  overrides: Partial<EventEnvelope> = {},
): EventEnvelope {
  return {
    eventId: randomUUID(),
    eventType,
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    correlationId: randomUUID(),
    producer,
    payload,
    ...overrides,
  };
}
