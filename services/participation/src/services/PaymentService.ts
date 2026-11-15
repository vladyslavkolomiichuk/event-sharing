import {
  CheckoutSessionSchema,
  EventPaymentListSchema,
  MyPaymentSchema,
  PaymentSchema,
  PayoutAccountSchema,
  PayoutOnboardingSchema,
  type CheckoutRequest,
  type CheckoutSession,
  type EventPaymentList,
  type MyPayment,
  type Payment as PaymentResponse,
  type PayoutAccount,
  type PayoutOnboarding,
  type UserRole,
} from '@event-sharing/contracts';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../config/env.js';
import { paymentProvider } from '../config/payment-provider.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { PaymentError } from '../domain/errors/PaymentError.js';
import { PolicyNotFoundError } from '../domain/errors/PolicyNotFoundError.js';
import type { Payment } from '../generated/prisma/client.js';
import type {
  PaymentProvider,
  PaymentWebhookEvent,
} from '../payments/PaymentProvider.js';
import { PaymentRepository } from '../repositories/PaymentRepository.js';
import { RegistrationPolicyRepository } from '../repositories/RegistrationPolicyRepository.js';

// Seat hold; the provider session closes two minutes earlier.
const HOLD_MS = 33 * 60_000;
const PROVIDER_GRACE_MS = 2 * 60_000;

export class PaymentService {
  constructor(
    private readonly payments = new PaymentRepository(),
    private readonly policies = new RegistrationPolicyRepository(),
    private readonly provider: PaymentProvider | null = paymentProvider,
  ) {}

  async checkout(
    eventId: string,
    userId: string,
    request: CheckoutRequest,
  ): Promise<CheckoutSession> {
    const provider = this.requireProvider();
    const reservation = await this.payments.reserve({
      eventId,
      userId,
      amountCents: request.amountCents,
      inviteId: request.inviteId,
      tokenHash: request.token
        ? createHash('sha256').update(request.token).digest('hex')
        : undefined,
      expiresAt: new Date(Date.now() + HOLD_MS),
    });
    const { payment, policy, account } = reservation;
    if (reservation.reused) return this.toCheckout(payment);
    try {
      const eventUrl = `${env.FRONTEND_ORIGIN}/events/${eventId}`;
      const session = await provider.createCheckout({
        paymentId: payment.id,
        accountId: account.providerAccountId,
        amountCents: payment.amountCents,
        feeCents: Math.round(
          (payment.amountCents * env.PAYMENT_PLATFORM_FEE_PERCENT) / 100,
        ),
        currency: payment.currency,
        title: policy.title,
        successUrl: `${eventUrl}?payment=success`,
        cancelUrl: `${eventUrl}?payment=cancelled`,
        expiresAt: new Date(payment.expiresAt.getTime() - PROVIDER_GRACE_MS),
      });
      return this.toCheckout(
        await this.payments.attachCheckout(
          payment.id,
          session.sessionId,
          session.url,
        ),
      );
    } catch (error) {
      await this.payments.expire(payment.id);
      console.error(
        'Checkout creation failed.',
        error instanceof Error ? error.message : 'UnknownError',
      );
      throw new PaymentError(
        'The payment provider is unavailable. Try again later.',
        'PAYMENT_PROVIDER_ERROR',
        502,
      );
    }
  }

  async webhook(body: Buffer, signature: string | undefined): Promise<string> {
    const provider = this.requireProvider();
    let event: PaymentWebhookEvent;
    try {
      if (!signature) throw new Error('Missing signature.');
      event = provider.parseWebhook(body, signature);
    } catch {
      throw new PaymentError(
        'Webhook signature is invalid.',
        'INVALID_WEBHOOK_SIGNATURE',
        400,
      );
    }
    if (event.type === 'checkout.completed') {
      if (!z.uuid().safeParse(event.paymentId).success) return 'ignored';
      return this.payments.confirm(
        event.paymentId,
        event.sessionId,
        event.providerPaymentId,
        event.amountCents,
      );
    }
    if (event.type === 'checkout.expired') {
      if (!z.uuid().safeParse(event.paymentId).success) return 'ignored';
      return (await this.payments.expire(event.paymentId))
        ? 'expired'
        : 'ignored';
    }
    if (event.type === 'account.updated') {
      await this.payments.updateAccount(event.accountId, {
        chargesEnabled: event.chargesEnabled,
        detailsSubmitted: event.detailsSubmitted,
      });
      return 'account';
    }
    return 'ignored';
  }

  async account(userId: string): Promise<PayoutAccount> {
    let account = await this.payments.account(userId);
    const provider = this.provider;
    if (account && !account.chargesEnabled && provider) {
      const { providerAccountId } = account;
      const state = await this.providerCall('Account refresh', () =>
        provider.account(providerAccountId),
      );
      await this.payments.updateAccount(providerAccountId, state);
      account = { ...account, ...state };
    }
    return PayoutAccountSchema.parse({
      available: this.provider !== null,
      connected: account !== null,
      chargesEnabled: account?.chargesEnabled ?? false,
      detailsSubmitted: account?.detailsSubmitted ?? false,
    });
  }

  async onboarding(userId: string): Promise<PayoutOnboarding> {
    const provider = this.requireProvider();
    const account =
      (await this.payments.account(userId)) ??
      (await this.payments.createAccount(
        userId,
        await this.providerCall('Account creation', () =>
          provider.createAccount(userId),
        ),
      ));
    const page = `${env.FRONTEND_ORIGIN}/payouts`;
    return PayoutOnboardingSchema.parse({
      url: await this.providerCall('Onboarding link', () =>
        provider.onboardingLink(
          account.providerAccountId,
          page,
          `${page}?refresh=1`,
        ),
      ),
    });
  }

  // Logs the provider message, hides it from the client.
  private async providerCall<T>(
    action: string,
    task: () => Promise<T>,
  ): Promise<T> {
    try {
      return await task();
    } catch (error) {
      console.error(
        `${action} failed.`,
        error instanceof Error ? error.message : 'UnknownError',
      );
      throw new PaymentError(
        'The payment provider is unavailable. Try again later.',
        'PAYMENT_PROVIDER_ERROR',
        502,
      );
    }
  }

  async mine(eventId: string, userId: string): Promise<MyPayment> {
    const payment = await this.payments.latest(eventId, userId);
    return MyPaymentSchema.parse({
      payment: payment ? this.toResponse(payment) : null,
    });
  }

  async forEvent(
    eventId: string,
    actorId: string,
    role: UserRole,
  ): Promise<EventPaymentList> {
    const policy = await this.policies.findByEventId(eventId);
    if (!policy) throw new PolicyNotFoundError();
    if (role !== 'ADMIN' && policy.organizerId !== actorId)
      throw new ForbiddenError();
    const rows = await this.payments.forEvent(eventId);
    const sum = (status: Payment['status']) =>
      rows
        .filter((row) => row.status === status)
        .reduce((total, row) => total + row.amountCents, 0);
    return EventPaymentListSchema.parse({
      items: rows.map((row) => this.toResponse(row)),
      paidCents: sum('PAID'),
      refundedCents: sum('REFUNDED'),
    });
  }

  private requireProvider(): PaymentProvider {
    if (!this.provider)
      throw new PaymentError(
        'Online payments are not configured.',
        'PAYMENTS_UNAVAILABLE',
        503,
      );
    return this.provider;
  }

  private toCheckout(payment: Payment): CheckoutSession {
    return CheckoutSessionSchema.parse({
      paymentId: payment.id,
      url: payment.checkoutUrl,
      expiresAt: payment.expiresAt.toISOString(),
    });
  }

  private toResponse(payment: Payment): PaymentResponse {
    return PaymentSchema.parse({
      id: payment.id,
      eventId: payment.eventId,
      userId: payment.userId,
      amountCents: payment.amountCents,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
      refundedAt: payment.refundedAt?.toISOString() ?? null,
    });
  }
}
