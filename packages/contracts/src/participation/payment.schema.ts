import { z } from 'zod';
import { PaymentCurrencySchema } from '../events/event-pricing.schema.js';

export const PaymentStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'EXPIRED',
  'REFUND_PENDING',
  'REFUNDED',
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const CheckoutRequestSchema = z.strictObject({
  amountCents: z.number().int().positive().max(1_000_000).optional(),
  inviteId: z.uuid().optional(),
  token: z.string().min(20).max(200).optional(),
});
export type CheckoutRequest = z.infer<typeof CheckoutRequestSchema>;

export const CheckoutSessionSchema = z.strictObject({
  paymentId: z.uuid(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
});
export type CheckoutSession = z.infer<typeof CheckoutSessionSchema>;

export const PaymentSchema = z.strictObject({
  id: z.uuid(),
  eventId: z.uuid(),
  userId: z.uuid(),
  amountCents: z.number().int().positive(),
  currency: PaymentCurrencySchema,
  status: PaymentStatusSchema,
  createdAt: z.iso.datetime(),
  paidAt: z.iso.datetime().nullable(),
  refundedAt: z.iso.datetime().nullable(),
});
export type Payment = z.infer<typeof PaymentSchema>;

export const MyPaymentSchema = z.strictObject({
  payment: PaymentSchema.nullable(),
});
export type MyPayment = z.infer<typeof MyPaymentSchema>;

export const EventPaymentListSchema = z.strictObject({
  items: z.array(PaymentSchema),
  paidCents: z.number().int().nonnegative(),
  refundedCents: z.number().int().nonnegative(),
});
export type EventPaymentList = z.infer<typeof EventPaymentListSchema>;

export const PayoutAccountSchema = z.strictObject({
  available: z.boolean(),
  connected: z.boolean(),
  chargesEnabled: z.boolean(),
  detailsSubmitted: z.boolean(),
});
export type PayoutAccount = z.infer<typeof PayoutAccountSchema>;

export const PayoutOnboardingSchema = z.strictObject({ url: z.url() });
export type PayoutOnboarding = z.infer<typeof PayoutOnboardingSchema>;
