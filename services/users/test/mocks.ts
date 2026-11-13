import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { createFakePrisma } from '../../../test/fake-prisma.js';

export const prisma = createFakePrisma();
export const serviceBus = { call: vi.fn() };
export const privacyDatabase = {
  pool: { query: vi.fn(async () => ({ rows: [], rowCount: 0 })) },
};
export const jwks = { current: undefined as any };

export function snapshot(
  profile: Record<string, unknown> = {},
  preferences: Record<string, unknown> = {},
): any {
  const userId = (profile.userId as string) ?? randomUUID();
  return {
    profile: {
      userId,
      name: 'Iryna Melnyk',
      username: 'iryna_melnyk',
      avatarUrl: 'https://cdn.test/a.png',
      bio: 'Hello',
      phone: '+380501234567',
      city: 'Kyiv',
      version: 1,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
      ...profile,
    },
    preferences: {
      userId,
      showPhone: false,
      showCity: true,
      notificationsEnabled: true,
      allowFriendRequests: true,
      allowInvitesFromStrangers: false,
      profileVisibility: 'PUBLIC',
      discoverableByUsername: true,
      showParticipationHistory: true,
      ...preferences,
    },
  };
}
