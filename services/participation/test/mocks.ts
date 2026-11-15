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
    startTime: new Date(Date.now() + 43200000),
    pricingMode: 'FREE',
    priceCents: 0,
    currency: 'EUR',
    refundHoursBeforeStart: null,
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

export const provider = {
  createAccount: vi.fn(),
  onboardingLink: vi.fn(),
  account: vi.fn(),
  createCheckout: vi.fn(),
  refund: vi.fn(),
  parseWebhook: vi.fn(),
};

export function paymentRow(overrides: Record<string, unknown> = {}): any {
  return {
    id: randomUUID(),
    eventId: randomUUID(),
    userId: randomUUID(),
    organizerId: randomUUID(),
    amountCents: 1500,
    currency: 'EUR',
    status: 'PENDING',
    held: true,
    expiresAt: new Date(Date.now() + 1_800_000),
    inviteId: null,
    inviteLinkId: null,
    providerSessionId: 'cs_test_1',
    providerPaymentId: null,
    checkoutUrl: 'https://checkout.stripe.test/cs_test_1',
    refundAttempts: 0,
    paidAt: null,
    refundedAt: null,
    createdAt: new Date('2026-11-14T10:00:00.000Z'),
    updatedAt: new Date('2026-11-14T10:00:00.000Z'),
    ...overrides,
  };
}
