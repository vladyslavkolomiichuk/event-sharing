export type CheckoutInput = {
  paymentId: string;
  accountId: string;
  amountCents: number;
  feeCents: number;
  currency: string;
  title: string;
  successUrl: string;
  cancelUrl: string;
  expiresAt: Date;
};

export type CheckoutResult = { sessionId: string; url: string };

export type ProviderAccount = {
  chargesEnabled: boolean;
  detailsSubmitted: boolean;
};

export type PaymentWebhookEvent =
  | {
      type: 'checkout.completed';
      paymentId: string;
      sessionId: string;
      providerPaymentId: string;
      amountCents: number;
    }
  | { type: 'checkout.expired'; paymentId: string }
  | ({ type: 'account.updated'; accountId: string } & ProviderAccount)
  | { type: 'ignored' };

// Hides the payment company behind one small interface.
export interface PaymentProvider {
  createAccount(userId: string): Promise<string>;
  onboardingLink(
    accountId: string,
    returnUrl: string,
    refreshUrl: string,
  ): Promise<string>;
  account(accountId: string): Promise<ProviderAccount>;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  refund(providerPaymentId: string, paymentId: string): Promise<void>;
  parseWebhook(body: Buffer, signature: string): PaymentWebhookEvent;
}
