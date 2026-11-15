import { z } from 'zod';

export const PRICING_MODES = ['FREE', 'ONLINE', 'ON_SITE', 'DONATION'] as const;
export const PricingModeSchema = z.enum(PRICING_MODES);
export type PricingMode = z.infer<typeof PricingModeSchema>;

export const PAYMENT_CURRENCIES = ['EUR', 'USD', 'UAH'] as const;
export const PaymentCurrencySchema = z.enum(PAYMENT_CURRENCIES);
export type PaymentCurrency = z.infer<typeof PaymentCurrencySchema>;

// Smallest card charge the payment provider accepts.
export const MIN_ONLINE_PRICE_CENTS = 50;
export const MAX_PRICE_CENTS = 1_000_000;

export const EventPricingSchema = z
  .strictObject({
    mode: PricingModeSchema,
    priceCents: z.number().int().min(0).max(MAX_PRICE_CENTS),
    currency: PaymentCurrencySchema,
    refundHoursBeforeStart: z.number().int().min(0).max(720).nullable(),
  })
  .superRefine((pricing, context) => {
    if (pricing.mode === 'FREE' && pricing.priceCents !== 0)
      context.addIssue({
        code: 'custom',
        message: 'Free events cannot have a price.',
        path: ['priceCents'],
      });
    if (
      pricing.mode === 'ONLINE' &&
      pricing.priceCents < MIN_ONLINE_PRICE_CENTS
    )
      context.addIssue({
        code: 'custom',
        message: 'Online prices must be at least 0.50.',
        path: ['priceCents'],
      });
    if (pricing.mode === 'ON_SITE' && pricing.priceCents === 0)
      context.addIssue({
        code: 'custom',
        message: 'Set the price paid at the venue.',
        path: ['priceCents'],
      });
  });

export type EventPricing = z.infer<typeof EventPricingSchema>;

export const FREE_EVENT_PRICING: EventPricing = {
  mode: 'FREE',
  priceCents: 0,
  currency: 'EUR',
  refundHoursBeforeStart: null,
};
