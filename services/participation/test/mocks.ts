import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createFakePrisma } from '../../../test/fake-prisma.js';

export const prisma = createFakePrisma();
export const serviceBus = { call: vi.fn() };
export const privacyDatabase = {
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
};
export const jwks = { current: undefined as any };

export function policyRow(overrides: Record<string, unknown> = {}): any {
  return {
    eventId: randomUUID(),
    organizerId: randomUUID(),
    version: 1,
    status: 'OPEN',
    capacity: 10,
    endTime: new Date(Date.now() + 86400000),
    visibility: 'PUBLIC',
    title: 'Jazz night',
    occupied: 2,
    updatedAt: new Date(),
    ...overrides,
  };
}

export function membershipRow(overrides: Record<string, unknown> = {}): any {
  return {
    eventId: randomUUID(),
    userId: randomUUID(),
    status: 'JOINED',
    joinedAt: new Date('2026-11-01T10:00:00.000Z'),
    leftAt: null,
    hiddenAt: null,
    lastMembershipEventId: null,
    ...overrides,
  };
}
