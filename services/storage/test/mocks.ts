import { vi } from 'vitest';
import { createFakePrisma } from '../../../test/fake-prisma.js';

export const prisma = createFakePrisma();
export const serviceBus = { call: vi.fn() };
export const privacyDatabase = {
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
};
export const jwks = { current: undefined as any };
