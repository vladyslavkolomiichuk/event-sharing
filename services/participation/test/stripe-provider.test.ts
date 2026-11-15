import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { StripePaymentProvider } from '../src/payments/StripePaymentProvider.js';

const secret = 'whsec_test_secret';
const provider = () => new StripePaymentProvider('sk_test_123', secret);
const stripeOf = (instance: StripePaymentProvider) =>
  (instance as unknown as { stripe: Stripe }).stripe;

function signed(event: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: 'evt_1',
    object: 'event',
    api_version: '2026-09-30.endive',
    created: 1,
    livemode: false,
    pending_webhooks: 0,
    request: null,
    ...event,
  });
  const signature = new Stripe('sk_test_123').webhooks.generateTestHeaderString(
    { payload, secret },
  );
  return { body: Buffer.from(payload), signature };
}

const session = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_1',
  object: 'checkout.session',
  client_reference_id: 'pay_1',
  payment_status: 'paid',
  payment_intent: 'pi_1',
  amount_total: 1500,
  ...overrides,
});

describe('StripePaymentProvider.parseWebhook', () => {
  it('maps a paid checkout to a confirmation', () => {
    const { body, signature } = signed({
      type: 'checkout.session.completed',
      data: { object: session() },
    });
    expect(provider().parseWebhook(body, signature)).toEqual({
      type: 'checkout.completed',
      paymentId: 'pay_1',
      sessionId: 'cs_1',
      providerPaymentId: 'pi_1',
      amountCents: 1500,
    });
  });

  it('waits for delayed payments to succeed', () => {
    const unpaid = signed({
      type: 'checkout.session.completed',
      data: { object: session({ payment_status: 'unpaid' }) },
    });
    expect(provider().parseWebhook(unpaid.body, unpaid.signature)).toEqual({
      type: 'ignored',
    });
    const later = signed({
      type: 'checkout.session.async_payment_succeeded',
      data: { object: session({ payment_intent: { id: 'pi_2' } }) },
    });
    expect(provider().parseWebhook(later.body, later.signature)).toMatchObject({
      type: 'checkout.completed',
      providerPaymentId: 'pi_2',
    });
  });

  it('maps expired checkouts and account updates', () => {
    const expired = signed({
      type: 'checkout.session.expired',
      data: { object: session() },
    });
    expect(provider().parseWebhook(expired.body, expired.signature)).toEqual({
      type: 'checkout.expired',
      paymentId: 'pay_1',
    });
    const account = signed({
      type: 'account.updated',
      data: {
        object: {
          id: 'acct_1',
          object: 'account',
          charges_enabled: true,
          details_submitted: false,
          capabilities: { transfers: 'active' },
        },
      },
    });
    expect(provider().parseWebhook(account.body, account.signature)).toEqual({
      type: 'account.updated',
      accountId: 'acct_1',
      chargesEnabled: true,
      detailsSubmitted: false,
    });
    const other = signed({ type: 'charge.refunded', data: { object: {} } });
    expect(provider().parseWebhook(other.body, other.signature)).toEqual({
      type: 'ignored',
    });
  });

  it('rejects a tampered body', () => {
    const { signature } = signed({
      type: 'checkout.session.completed',
      data: { object: session() },
    });
    const forged = Buffer.from(
      JSON.stringify({ type: 'checkout.session.completed' }),
    );
    expect(() => provider().parseWebhook(forged, signature)).toThrow();
  });
});

describe('StripePaymentProvider requests', () => {
  it('sends the payment to the organizer account', async () => {
    const instance = provider();
    const create = vi
      .spyOn(stripeOf(instance).checkout.sessions, 'create')
      .mockResolvedValue({ id: 'cs_1', url: 'https://pay.test/cs_1' } as any);
    const expiresAt = new Date('2026-11-14T12:00:00.000Z');
    expect(
      await instance.createCheckout({
        paymentId: 'pay_1',
        accountId: 'acct_1',
        amountCents: 1500,
        feeCents: 75,
        currency: 'EUR',
        title: 'Jazz night',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/no',
        expiresAt,
      }),
    ).toEqual({ sessionId: 'cs_1', url: 'https://pay.test/cs_1' });
    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({
      mode: 'payment',
      client_reference_id: 'pay_1',
      expires_at: expiresAt.getTime() / 1000,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'eur', unit_amount: 1500 },
        },
      ],
      payment_intent_data: {
        application_fee_amount: 75,
        transfer_data: { destination: 'acct_1' },
      },
    });
    expect(options).toEqual({ idempotencyKey: 'checkout-pay_1' });
  });

  it('skips a zero fee and needs a checkout URL', async () => {
    const instance = provider();
    const create = vi
      .spyOn(stripeOf(instance).checkout.sessions, 'create')
      .mockResolvedValue({ id: 'cs_1', url: null } as any);
    await expect(
      instance.createCheckout({
        paymentId: 'pay_1',
        accountId: 'acct_1',
        amountCents: 1500,
        feeCents: 0,
        currency: 'EUR',
        title: 'Jazz',
        successUrl: 'https://app.test/ok',
        cancelUrl: 'https://app.test/no',
        expiresAt: new Date(),
      }),
    ).rejects.toThrow('no URL');
    expect(create.mock.calls[0]![0]!.payment_intent_data).not.toHaveProperty(
      'application_fee_amount',
    );
  });

  it('refunds with the transfer reversed, once per payment', async () => {
    const instance = provider();
    const refund = vi
      .spyOn(stripeOf(instance).refunds, 'create')
      .mockResolvedValue({} as any);
    await instance.refund('pi_1', 'pay_1');
    expect(refund).toHaveBeenCalledWith(
      {
        payment_intent: 'pi_1',
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { paymentId: 'pay_1' },
      },
      { idempotencyKey: 'refund-pay_1' },
    );
  });

  it('creates v2 express accounts and onboarding links', async () => {
    const instance = provider();
    const stripe = stripeOf(instance);
    const create = vi
      .spyOn(stripe.v2.core.accounts, 'create')
      .mockResolvedValue({ id: 'acct_1' } as any);
    const update = vi
      .spyOn(stripe.v2.core.accounts, 'update')
      .mockResolvedValue({ id: 'acct_1' } as any);
    vi.spyOn(stripe.accountLinks, 'create').mockResolvedValue({
      url: 'https://connect.test/a',
    } as any);
    vi.spyOn(stripe.accounts, 'retrieve').mockResolvedValue({
      charges_enabled: true,
      details_submitted: true,
      capabilities: { transfers: 'active' },
    } as any);
    expect(await instance.createAccount('u1')).toBe('acct_1');
    expect(create.mock.calls[0]![0]).toMatchObject({
      dashboard: 'express',
      identity: { country: 'nl' },
      defaults: {
        responsibilities: { losses_collector: 'application' },
      },
      metadata: { userId: 'u1' },
    });
    expect(
      await instance.onboardingLink('acct_1', 'https://a', 'https://b'),
    ).toBe('https://connect.test/a');
    expect(update.mock.calls[0]![1]).toMatchObject({
      configuration: { recipient: { capabilities: expect.any(Object) } },
    });
    expect(await instance.account('acct_1')).toEqual({
      chargesEnabled: true,
      detailsSubmitted: true,
    });
  });

  it('keeps charges off until transfers are active', async () => {
    const instance = provider();
    vi.spyOn(stripeOf(instance).accounts, 'retrieve').mockResolvedValue({
      charges_enabled: true,
      details_submitted: true,
      capabilities: { transfers: 'pending' },
    } as any);
    expect(await instance.account('acct_1')).toEqual({
      chargesEnabled: false,
      detailsSubmitted: true,
    });
  });
});
