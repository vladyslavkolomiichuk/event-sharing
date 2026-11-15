import Stripe from 'stripe';
import type {
  CheckoutInput,
  CheckoutResult,
  PaymentProvider,
  PaymentWebhookEvent,
  ProviderAccount,
} from './PaymentProvider.js';

// Stripe Connect destination charges: money goes to the organizer.
export class StripePaymentProvider implements PaymentProvider {
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
    private readonly accountCountry = 'NL',
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2 });
  }

  // Accounts v2: Express dashboard, platform carries fees and losses.
  async createAccount(userId: string): Promise<string> {
    const account = await this.stripe.v2.core.accounts.create({
      dashboard: 'express',
      identity: { country: this.accountCountry.toLowerCase() },
      defaults: {
        responsibilities: {
          fees_collector: 'application',
          losses_collector: 'application',
        },
      },
      configuration: {
        merchant: { capabilities: { card_payments: { requested: true } } },
      },
      metadata: { userId },
    });
    return account.id;
  }

  async onboardingLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<string> {
    // Destination charges need transfers; creation rejects them without email.
    await this.stripe.v2.core.accounts.update(accountId, {
      configuration: {
        recipient: {
          capabilities: {
            stripe_balance: { stripe_transfers: { requested: true } },
          },
        },
      },
    });
    const link = await this.stripe.accountLinks.create({
      account: accountId,
      type: 'account_onboarding',
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return link.url;
  }

  async account(accountId: string): Promise<ProviderAccount> {
    return this.toAccount(await this.stripe.accounts.retrieve(accountId));
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: input.paymentId,
        metadata: { paymentId: input.paymentId },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amountCents,
              product_data: { name: input.title.slice(0, 250) },
            },
          },
        ],
        payment_intent_data: {
          ...(input.feeCents ? { application_fee_amount: input.feeCents } : {}),
          transfer_data: { destination: input.accountId },
          metadata: { paymentId: input.paymentId },
        },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      },
      { idempotencyKey: `checkout-${input.paymentId}` },
    );
    if (!session.url) throw new Error('Checkout session has no URL.');
    return { sessionId: session.id, url: session.url };
  }

  async refund(providerPaymentId: string, paymentId: string): Promise<void> {
    await this.stripe.refunds.create(
      {
        payment_intent: providerPaymentId,
        reverse_transfer: true,
        refund_application_fee: true,
        metadata: { paymentId },
      },
      { idempotencyKey: `refund-${paymentId}` },
    );
  }

  parseWebhook(body: Buffer, signature: string): PaymentWebhookEvent {
    const event = this.stripe.webhooks.constructEvent(
      body,
      signature,
      this.webhookSecret,
    );
    if (
      event.type === 'checkout.session.completed' ||
      event.type === 'checkout.session.async_payment_succeeded'
    ) {
      const session = event.data.object;
      const paymentIntent =
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id;
      if (
        session.payment_status !== 'paid' ||
        !session.client_reference_id ||
        !paymentIntent
      )
        return { type: 'ignored' };
      return {
        type: 'checkout.completed',
        paymentId: session.client_reference_id,
        sessionId: session.id,
        providerPaymentId: paymentIntent,
        amountCents: session.amount_total ?? 0,
      };
    }
    if (event.type === 'checkout.session.expired') {
      const paymentId = event.data.object.client_reference_id;
      return paymentId
        ? { type: 'checkout.expired', paymentId }
        : { type: 'ignored' };
    }
    if (event.type === 'account.updated') {
      const account = event.data.object;
      return {
        type: 'account.updated',
        accountId: account.id,
        ...this.toAccount(account),
      };
    }
    return { type: 'ignored' };
  }

  private toAccount(account: Stripe.Account): ProviderAccount {
    return {
      // Destination charges also need the transfers capability.
      chargesEnabled:
        (account.charges_enabled ?? false) &&
        account.capabilities?.transfers === 'active',
      detailsSubmitted: account.details_submitted ?? false,
    };
  }
}
