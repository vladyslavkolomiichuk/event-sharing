import {
  EventPricingSchema,
  type EventPricing,
} from '@event-sharing/contracts';
import type { RegistrationPolicy } from '../generated/prisma/client.js';

export function policyPricing(policy: RegistrationPolicy): EventPricing {
  return EventPricingSchema.parse({
    mode: policy.pricingMode,
    priceCents: policy.priceCents,
    currency: policy.currency,
    refundHoursBeforeStart: policy.refundHoursBeforeStart,
  });
}
