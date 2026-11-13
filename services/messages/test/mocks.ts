import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createFakePrisma } from '../../../test/fake-prisma.js';

export const prisma = createFakePrisma();
export const serviceBus = { call: vi.fn() };
export const privacyDatabase = {
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
};
export const jwks = { current: undefined as any };

export function roomRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: randomUUID(),
    eventId: randomUUID(),
    name: 'Backstage',
    access: 'SELECTED_MEMBERS',
    status: 'ACTIVE',
    createdAt: new Date('2026-11-01T10:00:00.000Z'),
    archivedAt: null,
    _count: { members: 2 },
    ...overrides,
  };
}

export function messageRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: randomUUID(),
    roomId: randomUUID(),
    eventId: randomUUID(),
    senderId: randomUUID(),
    clientMessageId: randomUUID(),
    body: 'Hello',
    createdAt: new Date('2026-11-01T10:05:00.000Z'),
    ...overrides,
  };
}
