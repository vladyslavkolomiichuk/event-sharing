import { z } from 'zod';

export const NotificationDeliveryPayloadSchema = z.strictObject({
  requestId: z.uuid(),
  channel: z.literal('EMAIL'),
  reason: z.enum(['EXPIRED', 'DELIVERY_FAILED']).optional(),
});

export type NotificationDeliveryPayload = z.infer<
  typeof NotificationDeliveryPayloadSchema
>;
