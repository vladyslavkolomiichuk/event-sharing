import type { PaymentProvider } from '../payments/PaymentProvider.js';
import { StripePaymentProvider } from '../payments/StripePaymentProvider.js';
import { env } from './env.js';

// Payments stay off until both Stripe secrets are set.
export const paymentProvider: PaymentProvider | null =
  env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET
    ? new StripePaymentProvider(
        env.STRIPE_SECRET_KEY,
        env.STRIPE_WEBHOOK_SECRET,
        env.STRIPE_ACCOUNT_COUNTRY,
      )
    : null;
