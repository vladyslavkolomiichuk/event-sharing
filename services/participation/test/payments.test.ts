import { randomUUID } from 'node:crypto';
import { EVENT_TYPES } from '@event-sharing/contracts';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestJwt, send, type TestJwt } from '../../../test/helpers.js';
import {
  jwks,
  membershipRow,
  paymentRow,
  policyRow,
  prisma,
  provider,
} from './mocks.js';

vi.mock('../src/database/client.js', () => import('./mocks.js'));
vi.mock('../src/config/service-bus.js', () => import('./mocks.js'));
vi.mock('../src/config/payment-provider.js', async () => ({
  paymentProvider: (await import('./mocks.js')).provider,
}));
vi.mock('../src/config/internal-jwks.js', async () => {
  const mocks = await import('./mocks.js');
  return { internalJwks: (...args: unknown[]) => mocks.jwks.current(...args) };
});

const { refundAllowed } = await import('../src/domain/RefundPolicy.js');
const { ParticipationRepository } =
  await import('../src/repositories/ParticipationRepository.js');
const { RegistrationPolicyRepository } =
  await import('../src/repositories/RegistrationPolicyRepository.js');
const { PaymentRepository } =
  await import('../src/repositories/PaymentRepository.js');
const { PaymentService } = await import('../src/services/PaymentService.js');
const { PaymentWorker } = await import('../src/workers/PaymentWorker.js');
const { createApp } = await import('../src/app.js');

const hours = (count: number) => new Date(Date.now() + count * 3_600_000);
const paidPolicy = (overrides: Record<string, unknown> = {}) =>
  policyRow({ pricingMode: 'ONLINE', priceCents: 1500, ...overrides });
const account = (overrides: Record<string, unknown> = {}) => ({
  userId: randomUUID(),
  providerAccountId: 'acct_1',
  chargesEnabled: true,
  detailsSubmitted: true,
  ...overrides,
});
const outbox = () =>
  prisma.outboxEvent.create.mock.calls.map((call: any[]) => call[0].data);

beforeEach(() => {
  prisma.reset();
  for (const method of Object.values(provider)) method.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('refundAllowed', () => {
  it('needs a deadline that has not passed', () => {
    expect(refundAllowed(policyRow())).toBe(false);
    expect(
      refundAllowed(
        policyRow({ refundHoursBeforeStart: 24, startTime: hours(48) }),
      ),
    ).toBe(true);
    expect(
      refundAllowed(
        policyRow({ refundHoursBeforeStart: 24, startTime: hours(12) }),
      ),
    ).toBe(false);
  });

  it('falls back to the end time, then allows refunds', () => {
    expect(
      refundAllowed(
        policyRow({
          refundHoursBeforeStart: 1,
          startTime: null,
          endTime: hours(5),
        }),
      ),
    ).toBe(true);
    expect(
      refundAllowed(
        policyRow({
          refundHoursBeforeStart: 1,
          startTime: null,
          endTime: null,
        }),
      ),
    ).toBe(true);
  });
});

describe('free joining and leaving', () => {
  const repository = new ParticipationRepository();

  it('asks for payment on paid online events', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    prisma.membership.findUnique.mockResolvedValue(null);
    await expect(repository.join('e1', 'u1')).rejects.toMatchObject({
      code: 'PAYMENT_REQUIRED',
      statusCode: 402,
    });
  });

  it('lets people join donation and venue-paid events for free', async () => {
    for (const pricingMode of ['DONATION', 'ON_SITE']) {
      prisma.reset();
      const policy = policyRow({ pricingMode, priceCents: 500 });
      prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.update.mockResolvedValue(membershipRow());
      await repository.join(policy.eventId, randomUUID());
      expect(prisma.membership.create).toHaveBeenCalled();
    }
  });

  it('refunds a paid ticket when leaving in time', async () => {
    const policy = paidPolicy({
      refundHoursBeforeStart: 24,
      startTime: hours(48),
    });
    const userId = randomUUID();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.membership.findUnique.mockResolvedValue(membershipRow());
    prisma.membership.update.mockResolvedValue(membershipRow());
    await repository.leave(policy.eventId, userId);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { eventId: policy.eventId, userId, status: 'PAID' },
      data: { status: 'REFUND_PENDING' },
    });
  });

  it('keeps the payment when leaving after the deadline', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ refundHoursBeforeStart: 24, startTime: hours(2) }),
    );
    prisma.membership.findUnique.mockResolvedValue(membershipRow());
    prisma.membership.update.mockResolvedValue(membershipRow());
    await repository.leave(randomUUID(), randomUUID());
    expect(prisma.payment.updateMany).not.toHaveBeenCalled();
  });
});

describe('policy pricing', () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    eventId: randomUUID(),
    organizerId: randomUUID(),
    policyVersion: 1,
    status: 'OPEN' as const,
    capacity: 10,
    visibility: 'PUBLIC' as const,
    title: 'Jazz',
    startTime: hours(30).toISOString(),
    pricing: {
      mode: 'ONLINE' as const,
      priceCents: 1500,
      currency: 'EUR' as const,
      refundHoursBeforeStart: 24,
    },
    ...overrides,
  });

  it('stores the price and start time with the policy', async () => {
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    prisma.registrationPolicy.findUnique.mockResolvedValue(null);
    prisma.pendingPolicyEvent.findUnique.mockResolvedValue(null);
    prisma.personalInvite.findMany.mockResolvedValue([]);
    const input = request();
    await new RegistrationPolicyRepository().apply('m1', input);
    expect(
      prisma.registrationPolicy.create.mock.calls[0][0].data,
    ).toMatchObject({
      pricingMode: 'ONLINE',
      priceCents: 1500,
      currency: 'EUR',
      refundHoursBeforeStart: 24,
      startTime: new Date(input.startTime),
    });
  });

  it('refunds paid tickets and drops holds on cancellation', async () => {
    const input = request({ policyVersion: 2, status: 'CANCELLED' });
    prisma.inboxEvent.findUnique.mockResolvedValue(null);
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: input.eventId, version: 1 }),
    );
    prisma.pendingPolicyEvent.findUnique.mockResolvedValue(null);
    await new RegistrationPolicyRepository().apply('m2', input);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { eventId: input.eventId, status: 'PAID' },
      data: { status: 'REFUND_PENDING' },
    });
    expect(prisma.payment.updateMany).toHaveBeenCalledWith({
      where: { eventId: input.eventId, status: 'PENDING' },
      data: { held: false },
    });
  });
});

describe('PaymentRepository.reserve', () => {
  const repository = new PaymentRepository();
  const reserve = (overrides: Record<string, unknown> = {}) =>
    repository.reserve({
      eventId: 'e1',
      userId: 'u1',
      amountCents: undefined,
      inviteId: undefined,
      tokenHash: undefined,
      expiresAt: hours(1),
      ...overrides,
    });

  beforeEach(() => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: 'e1' }),
    );
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.payoutAccount.findUnique.mockResolvedValue(account());
    prisma.payment.findFirst.mockResolvedValue(null);
    prisma.payment.create.mockImplementation(async ({ data }: any) =>
      paymentRow(data),
    );
  });

  it('holds a seat at the event price', async () => {
    const result = await reserve({ amountCents: 1 });
    expect(result.reused).toBe(false);
    expect(prisma.payment.create.mock.calls[0][0].data).toMatchObject({
      eventId: 'e1',
      userId: 'u1',
      amountCents: 1500,
      currency: 'EUR',
    });
    expect(prisma.registrationPolicy.update).toHaveBeenCalledWith({
      where: { eventId: 'e1' },
      data: { occupied: { increment: 1 } },
    });
  });

  it('takes the chosen donation amount', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      policyRow({ eventId: 'e1', pricingMode: 'DONATION' }),
    );
    await reserve({ amountCents: 700 });
    expect(prisma.payment.create.mock.calls[0][0].data.amountCents).toBe(700);
  });

  it('rejects events without online payment', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      policyRow({ eventId: 'e1' }),
    );
    await expect(reserve()).rejects.toMatchObject({
      code: 'PAYMENT_NOT_REQUIRED',
    });
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      policyRow({ eventId: 'e1', pricingMode: 'DONATION' }),
    );
    await expect(reserve({ amountCents: 10 })).rejects.toMatchObject({
      code: 'PAYMENT_NOT_REQUIRED',
    });
  });

  it('rejects members and organizers without payouts', async () => {
    prisma.membership.findUnique.mockResolvedValue(membershipRow());
    await expect(reserve()).rejects.toMatchObject({ code: 'ALREADY_JOINED' });
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.payoutAccount.findUnique.mockResolvedValue(
      account({ chargesEnabled: false }),
    );
    await expect(reserve()).rejects.toMatchObject({
      code: 'ORGANIZER_PAYMENTS_UNAVAILABLE',
    });
  });

  it('reuses an open checkout instead of holding another seat', async () => {
    const open = paymentRow({ eventId: 'e1', userId: 'u1' });
    prisma.payment.findFirst.mockResolvedValue(open);
    const result = await reserve();
    expect(result).toMatchObject({ payment: open, reused: true });
    expect(prisma.registrationPolicy.update).not.toHaveBeenCalled();
  });

  it('replaces a stale checkout and frees its seat first', async () => {
    prisma.payment.findFirst.mockResolvedValue(
      paymentRow({ eventId: 'e1', checkoutUrl: null }),
    );
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: 'e1', occupied: 10 }),
    );
    await reserve();
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.payment.update.mock.calls[0][0].data).toEqual({
      status: 'EXPIRED',
      held: false,
    });
    expect(prisma.payment.create).toHaveBeenCalled();
  });

  it('respects capacity and invitations', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: 'e1', occupied: 10 }),
    );
    await expect(reserve()).rejects.toMatchObject({
      code: 'CAPACITY_REACHED',
    });
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: 'e1', visibility: 'INVITE_ONLY' }),
    );
    await expect(reserve()).rejects.toMatchObject({
      code: 'INVITATION_REQUIRED',
    });
  });
});

describe('PaymentRepository.confirm', () => {
  const repository = new PaymentRepository();
  const confirm = (payment: any, amount = payment.amountCents) =>
    repository.confirm(payment.id, 'cs_test_1', 'pi_1', amount);

  beforeEach(() => {
    prisma.membership.findUnique.mockResolvedValue(null);
    prisma.membership.update.mockResolvedValue(membershipRow());
  });

  it('seats a buyer with a held place', async () => {
    const payment = paymentRow();
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ eventId: payment.eventId }),
    );
    expect(await confirm(payment)).toBe('joined');
    expect(prisma.registrationPolicy.update).not.toHaveBeenCalled();
    expect(outbox()[0].eventType).toBe(EVENT_TYPES.userJoined);
    expect(prisma.payment.update.mock.calls[0][0].data).toMatchObject({
      status: 'PAID',
      providerPaymentId: 'pi_1',
      held: false,
    });
  });

  it('consumes the stored invitation', async () => {
    const payment = paymentRow({ inviteId: randomUUID() });
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    await confirm(payment);
    expect(prisma.personalInvite.update).toHaveBeenCalledWith({
      where: { id: payment.inviteId },
      data: { status: 'ACCEPTED' },
    });
  });

  it('seats a late payment while places remain', async () => {
    const payment = paymentRow({ status: 'EXPIRED', held: false });
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    expect(await confirm(payment)).toBe('joined');
    expect(prisma.registrationPolicy.update).toHaveBeenCalledWith({
      where: { eventId: payment.eventId },
      data: { occupied: { increment: 1 } },
    });
  });

  it('refunds a late payment when the event is full', async () => {
    const payment = paymentRow({ status: 'EXPIRED', held: false });
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(
      paidPolicy({ occupied: 10 }),
    );
    expect(await confirm(payment)).toBe('refund');
    expect(prisma.payment.update.mock.calls[0][0].data.status).toBe(
      'REFUND_PENDING',
    );
    expect(prisma.membership.create).not.toHaveBeenCalled();
  });

  it('refunds members and frees their held seat', async () => {
    const payment = paymentRow();
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    prisma.membership.findUnique.mockResolvedValue(membershipRow());
    expect(await confirm(payment)).toBe('refund');
    expect(prisma.registrationPolicy.update).toHaveBeenCalledWith({
      where: { eventId: payment.eventId },
      data: { occupied: { decrement: 1 } },
    });
  });

  it('ignores repeats and rejects mismatches', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    prisma.payment.findUnique.mockResolvedValue(null);
    expect(await confirm(paymentRow())).toBe('missing');
    const paid = paymentRow({ status: 'PAID' });
    prisma.payment.findUnique.mockResolvedValue(paid);
    expect(await confirm(paid)).toBe('duplicate');
    const pending = paymentRow();
    prisma.payment.findUnique.mockResolvedValue(pending);
    await expect(confirm(pending, 1)).rejects.toThrow('does not match');
  });
});

describe('PaymentRepository expiry and refunds', () => {
  const repository = new PaymentRepository();

  it('expires due holds and frees seats', async () => {
    const payment = paymentRow({ expiresAt: hours(-1) });
    prisma.payment.findMany.mockResolvedValue([{ id: payment.id }]);
    prisma.payment.findUnique.mockResolvedValue(payment);
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    expect(await repository.expireDue()).toBe(1);
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.payment.update.mock.calls[0][0].data).toEqual({
      status: 'EXPIRED',
      held: false,
    });
  });

  it('leaves paid and released payments alone', async () => {
    prisma.registrationPolicy.findUnique.mockResolvedValue(paidPolicy());
    prisma.payment.findUnique.mockResolvedValue(paymentRow({ status: 'PAID' }));
    expect(await repository.expire('p1')).toBe(false);
    prisma.payment.findUnique.mockResolvedValue(null);
    expect(await repository.expire('p1')).toBe(false);
    prisma.payment.findUnique.mockResolvedValue(paymentRow({ held: false }));
    expect(await repository.expire('p1')).toBe(true);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('marks refunds and counts failures', async () => {
    await repository.markRefunded('p1');
    expect(prisma.payment.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: 'p1', status: 'REFUND_PENDING' },
      data: { status: 'REFUNDED' },
    });
    await repository.refundFailed('p1');
    expect(prisma.payment.update.mock.calls[0][0].data).toEqual({
      refundAttempts: { increment: 1 },
    });
  });
});

describe('PaymentService', () => {
  const service = () => new PaymentService();

  it('creates a checkout for a held seat', async () => {
    const payment = paymentRow({ checkoutUrl: null });
    const policy = paidPolicy({ eventId: payment.eventId, title: 'Jazz' });
    const reserve = vi
      .spyOn(PaymentRepository.prototype, 'reserve')
      .mockResolvedValue({
        payment,
        policy,
        account: account(),
        reused: false,
      } as any);
    provider.createCheckout.mockResolvedValue({
      sessionId: 'cs_1',
      url: 'https://checkout.stripe.test/cs_1',
    });
    prisma.payment.update.mockResolvedValue({
      ...payment,
      checkoutUrl: 'https://checkout.stripe.test/cs_1',
    });
    const session = await service().checkout(payment.eventId, 'u1', {
      token: 't'.repeat(30),
    });
    expect(session.url).toBe('https://checkout.stripe.test/cs_1');
    expect(reserve.mock.calls[0]![0].tokenHash).toMatch(/^[a-f0-9]{64}$/);
    const input = provider.createCheckout.mock.calls[0][0];
    expect(input).toMatchObject({
      paymentId: payment.id,
      accountId: 'acct_1',
      amountCents: 1500,
      feeCents: 0,
      title: 'Jazz',
      successUrl: `http://app.test/events/${payment.eventId}?payment=success`,
    });
    expect(input.expiresAt.getTime()).toBeLessThan(payment.expiresAt.getTime());
    reserve.mockRestore();
  });

  it('returns a reused checkout without the provider', async () => {
    const payment = paymentRow();
    const reserve = vi
      .spyOn(PaymentRepository.prototype, 'reserve')
      .mockResolvedValue({ payment, reused: true } as any);
    const session = await service().checkout(payment.eventId, 'u1', {});
    expect(session.paymentId).toBe(payment.id);
    expect(provider.createCheckout).not.toHaveBeenCalled();
    reserve.mockRestore();
  });

  it('frees the seat when the provider fails', async () => {
    const payment = paymentRow({ checkoutUrl: null });
    const reserve = vi
      .spyOn(PaymentRepository.prototype, 'reserve')
      .mockResolvedValue({
        payment,
        policy: paidPolicy(),
        account: account(),
        reused: false,
      } as any);
    const expire = vi
      .spyOn(PaymentRepository.prototype, 'expire')
      .mockResolvedValue(true);
    provider.createCheckout.mockRejectedValue(new Error('down'));
    await expect(
      service().checkout(payment.eventId, 'u1', {}),
    ).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR',
      statusCode: 502,
    });
    expect(expire).toHaveBeenCalledWith(payment.id);
    reserve.mockRestore();
    expire.mockRestore();
  });

  it('is unavailable without a provider', async () => {
    const off = new PaymentService(undefined, undefined, null);
    await expect(off.checkout('e1', 'u1', {})).rejects.toMatchObject({
      code: 'PAYMENTS_UNAVAILABLE',
      statusCode: 503,
    });
    prisma.payoutAccount.findUnique.mockResolvedValue(null);
    expect(await off.account('u1')).toEqual({
      available: false,
      connected: false,
      chargesEnabled: false,
      detailsSubmitted: false,
    });
  });

  it('handles signed webhook events', async () => {
    const confirm = vi
      .spyOn(PaymentRepository.prototype, 'confirm')
      .mockResolvedValue('joined');
    const paymentId = randomUUID();
    provider.parseWebhook.mockReturnValue({
      type: 'checkout.completed',
      paymentId,
      sessionId: 'cs_1',
      providerPaymentId: 'pi_1',
      amountCents: 1500,
    });
    expect(await service().webhook(Buffer.from('{}'), 'sig')).toBe('joined');
    expect(confirm).toHaveBeenCalledWith(paymentId, 'cs_1', 'pi_1', 1500);

    provider.parseWebhook.mockReturnValue({
      type: 'checkout.completed',
      paymentId: 'not-a-uuid',
    });
    expect(await service().webhook(Buffer.from('{}'), 'sig')).toBe('ignored');

    provider.parseWebhook.mockReturnValue({
      type: 'account.updated',
      accountId: 'acct_1',
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    expect(await service().webhook(Buffer.from('{}'), 'sig')).toBe('account');
    expect(prisma.payoutAccount.updateMany).toHaveBeenCalledWith({
      where: { providerAccountId: 'acct_1' },
      data: { chargesEnabled: true, detailsSubmitted: true },
    });
    confirm.mockRestore();
  });

  it('expires checkouts the provider closed', async () => {
    const expire = vi
      .spyOn(PaymentRepository.prototype, 'expire')
      .mockResolvedValue(true);
    provider.parseWebhook.mockReturnValue({
      type: 'checkout.expired',
      paymentId: randomUUID(),
    });
    expect(await service().webhook(Buffer.from('{}'), 'sig')).toBe('expired');
    provider.parseWebhook.mockReturnValue({ type: 'ignored' });
    expect(await service().webhook(Buffer.from('{}'), 'sig')).toBe('ignored');
    expire.mockRestore();
  });

  it('rejects unsigned or forged webhooks', async () => {
    await expect(
      service().webhook(Buffer.from('{}'), undefined),
    ).rejects.toMatchObject({ code: 'INVALID_WEBHOOK_SIGNATURE' });
    provider.parseWebhook.mockImplementation(() => {
      throw new Error('bad');
    });
    await expect(
      service().webhook(Buffer.from('{}'), 'sig'),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('refreshes unfinished payout accounts', async () => {
    prisma.payoutAccount.findUnique.mockResolvedValue(
      account({ chargesEnabled: false, detailsSubmitted: false }),
    );
    provider.account.mockResolvedValue({
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    expect(await service().account('u1')).toEqual({
      available: true,
      connected: true,
      chargesEnabled: true,
      detailsSubmitted: true,
    });
    expect(prisma.payoutAccount.updateMany).toHaveBeenCalled();
  });

  it('creates an account once and links to onboarding', async () => {
    prisma.payoutAccount.findUnique.mockResolvedValue(null);
    provider.createAccount.mockResolvedValue('acct_new');
    prisma.payoutAccount.upsert.mockResolvedValue(
      account({ providerAccountId: 'acct_new' }),
    );
    provider.onboardingLink.mockResolvedValue('https://connect.stripe.test/x');
    expect(await service().onboarding('u1')).toEqual({
      url: 'https://connect.stripe.test/x',
    });
    expect(provider.onboardingLink).toHaveBeenCalledWith(
      'acct_new',
      'http://app.test/payouts',
      'http://app.test/payouts?refresh=1',
    );
    prisma.payoutAccount.findUnique.mockResolvedValue(account());
    await service().onboarding('u1');
    expect(provider.createAccount).toHaveBeenCalledTimes(1);
  });

  it('reports provider failures during onboarding as 502', async () => {
    prisma.payoutAccount.findUnique.mockResolvedValue(null);
    provider.createAccount.mockRejectedValue(new Error('Connect is off'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(service().onboarding('u1')).rejects.toMatchObject({
      code: 'PAYMENT_PROVIDER_ERROR',
      statusCode: 502,
    });
    expect(error).toHaveBeenCalledWith(
      'Account creation failed.',
      'Connect is off',
    );
    expect(prisma.payoutAccount.upsert).not.toHaveBeenCalled();
  });

  it('shows sales only to the organizer', async () => {
    const policy = paidPolicy();
    prisma.registrationPolicy.findUnique.mockResolvedValue(policy);
    prisma.payment.findMany.mockResolvedValue([
      paymentRow({ status: 'PAID', paidAt: new Date() }),
      paymentRow({ status: 'PAID', amountCents: 500 }),
      paymentRow({ status: 'REFUNDED', refundedAt: new Date() }),
    ]);
    const list = await service().forEvent(
      policy.eventId,
      policy.organizerId,
      'ORGANIZER',
    );
    expect(list).toMatchObject({ paidCents: 2000, refundedCents: 1500 });
    expect(list.items).toHaveLength(3);
    await expect(
      service().forEvent(policy.eventId, randomUUID(), 'USER'),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    prisma.registrationPolicy.findUnique.mockResolvedValue(null);
    await expect(
      service().forEvent(policy.eventId, randomUUID(), 'ADMIN'),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('returns the latest own payment', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    expect(await service().mine('e1', 'u1')).toEqual({ payment: null });
    const payment = paymentRow({ status: 'PAID', paidAt: new Date() });
    prisma.payment.findFirst.mockResolvedValue(payment);
    expect((await service().mine('e1', 'u1')).payment?.status).toBe('PAID');
  });
});

describe('PaymentWorker', () => {
  it('expires holds and sends due refunds', async () => {
    const payments = {
      expireDue: vi.fn(async () => 0),
      refundsDue: vi.fn(async () => [
        paymentRow({ id: 'p1', providerPaymentId: 'pi_1' }),
        paymentRow({ id: 'p2', providerPaymentId: 'pi_2' }),
        paymentRow({ id: 'p3', providerPaymentId: null }),
      ]),
      markRefunded: vi.fn(),
      refundFailed: vi.fn(),
    };
    provider.refund
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('declined'));
    await new PaymentWorker(payments as any, provider).tick();
    expect(payments.expireDue).toHaveBeenCalled();
    expect(provider.refund).toHaveBeenCalledWith('pi_1', 'p1');
    expect(payments.markRefunded).toHaveBeenCalledWith('p1');
    expect(payments.refundFailed.mock.calls).toEqual([['p2'], ['p3']]);
  });

  it('only expires holds without a provider', async () => {
    const payments = { expireDue: vi.fn(async () => 0), refundsDue: vi.fn() };
    await new PaymentWorker(payments as any, null).tick();
    expect(payments.refundsDue).not.toHaveBeenCalled();
  });

  it('survives failures and stops cleanly', async () => {
    const payments = {
      expireDue: vi.fn(async () => {
        throw new Error('db down');
      }),
    };
    const worker = new PaymentWorker(payments as any, null, 60_000);
    worker.start();
    await worker.stop();
    expect(console.error).toHaveBeenCalledWith(
      'Payment worker failed.',
      'db down',
    );
  });
});

describe('HTTP payment routes', () => {
  let jwt: TestJwt;
  beforeAll(async () => {
    jwt = await createTestJwt();
    jwks.current = jwt.jwks;
  });
  const app = () => createApp({ check: async () => true });
  const as = async (sub = randomUUID()) => ({
    authorization: `Bearer ${await jwt.token({ sub, role: 'USER' })}`,
  });

  it('passes the raw body and signature to the webhook handler', async () => {
    provider.parseWebhook.mockReturnValue({ type: 'ignored' });
    const response = await send(
      app(),
      'POST',
      '/api/public/payments/webhook',
      '{"id":"evt_1"}',
      { 'stripe-signature': 't=1,v1=abc' },
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ received: true, result: 'ignored' });
    const [body, signature] = provider.parseWebhook.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.toString()).toBe('{"id":"evt_1"}');
    expect(signature).toBe('t=1,v1=abc');
  });

  it('rejects a forged webhook with 400', async () => {
    provider.parseWebhook.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const response = await send(
      app(),
      'POST',
      '/api/public/payments/webhook',
      '{}',
      { 'stripe-signature': 'x' },
    );
    expect(response.status).toBe(400);
  });

  it('starts checkout and validates the body', async () => {
    const eventId = randomUUID();
    const checkout = vi
      .spyOn(PaymentService.prototype, 'checkout')
      .mockResolvedValue({
        paymentId: randomUUID(),
        url: 'https://checkout.stripe.test/cs',
        expiresAt: new Date().toISOString(),
      });
    const headers = await as();
    const created = await send(
      app(),
      'POST',
      `/api/participation/events/${eventId}/checkout`,
      { amountCents: 700 },
      headers,
    );
    expect(created.status).toBe(201);
    expect(checkout.mock.calls[0]![2]).toEqual({ amountCents: 700 });
    const invalid = await send(
      app(),
      'POST',
      `/api/participation/events/${eventId}/checkout`,
      { amountCents: -1 },
      headers,
    );
    expect(invalid.status).toBe(400);
    checkout.mockRestore();
  });

  it('serves account, onboarding and payment reads', async () => {
    const headers = await as();
    const eventId = randomUUID();
    prisma.payoutAccount.findUnique.mockResolvedValue(account());
    provider.onboardingLink.mockResolvedValue('https://connect.stripe.test/x');
    prisma.payment.findFirst.mockResolvedValue(null);
    expect(
      (
        await send(
          app(),
          'GET',
          '/api/participation/payments/account',
          undefined,
          headers,
        )
      ).body.chargesEnabled,
    ).toBe(true);
    expect(
      (
        await send(
          app(),
          'POST',
          '/api/participation/payments/account/onboarding',
          {},
          headers,
        )
      ).body.url,
    ).toBe('https://connect.stripe.test/x');
    expect(
      (
        await send(
          app(),
          'GET',
          `/api/participation/events/${eventId}/payments/me`,
          undefined,
          headers,
        )
      ).body,
    ).toEqual({ payment: null });
    prisma.registrationPolicy.findUnique.mockResolvedValue(null);
    expect(
      (
        await send(
          app(),
          'GET',
          `/api/participation/events/${eventId}/payments`,
          undefined,
          headers,
        )
      ).status,
    ).toBe(404);
  });
});
