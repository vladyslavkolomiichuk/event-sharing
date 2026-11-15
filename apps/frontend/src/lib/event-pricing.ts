import {
  EventPricingSchema,
  FREE_EVENT_PRICING,
  type EventPricing,
  type PaymentCurrency,
  type PricingMode,
} from '@event-sharing/contracts';
import { formatMoney, parseMoney } from './format-money';

export type PricingDraft = {
  mode: PricingMode;
  price: string;
  currency: PaymentCurrency;
  refunds: boolean;
  refundHours: string;
};

export const FREE_PRICING_DRAFT: PricingDraft = {
  mode: 'FREE',
  price: '',
  currency: 'EUR',
  refunds: true,
  refundHours: '24',
};

export function pricingDraft(pricing: EventPricing): PricingDraft {
  return {
    mode: pricing.mode,
    price: pricing.priceCents ? (pricing.priceCents / 100).toFixed(2) : '',
    currency: pricing.currency,
    refunds: pricing.refundHoursBeforeStart !== null,
    refundHours: String(pricing.refundHoursBeforeStart ?? 24),
  };
}

// Returns the pricing to save, or an error message.
export function draftPricing(draft: PricingDraft): EventPricing | string {
  if (draft.mode === 'FREE')
    return { ...FREE_EVENT_PRICING, currency: draft.currency };
  const priceCents = draft.price.trim() ? parseMoney(draft.price) : 0;
  if (priceCents === null) return 'Enter the price as a number, like 15.00.';
  const refundHours = Number(draft.refundHours);
  if (
    draft.mode === 'ONLINE' &&
    draft.refunds &&
    (!Number.isInteger(refundHours) || refundHours < 0 || refundHours > 720)
  )
    return 'Refund deadline must be between 0 and 720 hours.';
  const result = EventPricingSchema.safeParse({
    mode: draft.mode,
    priceCents,
    currency: draft.currency,
    refundHoursBeforeStart:
      draft.mode === 'ONLINE' && draft.refunds ? refundHours : null,
  });
  return result.success
    ? result.data
    : (result.error.issues[0]?.message ?? 'Check the price.');
}

export function pricingLabel(pricing: EventPricing): string {
  const price = formatMoney(pricing.priceCents, pricing.currency);
  if (pricing.mode === 'ONLINE') return `${price}, paid online`;
  if (pricing.mode === 'ON_SITE') return `${price}, paid at the venue`;
  if (pricing.mode === 'DONATION')
    return pricing.priceCents
      ? `Free, donation suggested ${price}`
      : 'Free, donations welcome';
  return 'Free';
}
