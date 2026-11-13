import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createFakePrisma } from '../../../test/fake-prisma.js';

export const prisma = createFakePrisma();
export const serviceBus = { call: vi.fn() };
export const privacyDatabase = {
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
};
export const jwks = { current: undefined as any };

// A stored event row, as Prisma returns it.
export function eventRow(overrides: Record<string, unknown> = {}): any {
  const start = new Date(Date.now() + 86400000);
  return {
    id: randomUUID(),
    organizerId: randomUUID(),
    categoryId: null,
    category: null,
    title: 'Jazz night',
    description: 'Live music.',
    startTime: start,
    endTime: new Date(start.getTime() + 7200000),
    timeZone: 'Europe/Kyiv',
    status: 'DRAFT',
    registrationStatus: 'CLOSED',
    pendingRegistrationStatus: null,
    moderationReason: null,
    cancellationReason: null,
    locationAddress: 'Khreshchatyk 1',
    locationRegion: 'Kyiv',
    latitude: '50.450100',
    longitude: '30.523400',
    locationVisibility: 'PUBLIC',
    participantLimit: 20,
    chatEnabled: false,
    visibility: 'PUBLIC',
    version: 1,
    lastSnapshotEventId: null,
    policyVersion: 0,
    pendingPolicyVersion: null,
    pendingStatus: null,
    pendingParticipantLimit: null,
    pendingCancellationReason: null,
    policyError: null,
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    updatedAt: new Date('2026-11-01T10:00:00.000Z'),
    ...overrides,
  };
}
