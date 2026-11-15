import {
  EventPricingSchema,
  type EventPricing,
} from '@event-sharing/contracts';
import type { Event } from '../generated/prisma/client.js';

export function eventPricing(event: Event): EventPricing {
  return EventPricingSchema.parse({
    mode: event.pricingMode,
    priceCents: event.priceCents,
    currency: event.currency,
    refundHoursBeforeStart: event.refundHoursBeforeStart,
  });
}

export function pricingColumns(pricing: EventPricing) {
  return {
    pricingMode: pricing.mode,
    priceCents: pricing.priceCents,
    currency: pricing.currency,
    refundHoursBeforeStart: pricing.refundHoursBeforeStart,
  };
}
