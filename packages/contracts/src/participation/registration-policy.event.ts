import { z } from 'zod';

export const RegistrationPolicyRequestedPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  organizerId: z.uuid(),
  policyVersion: z.number().int().positive(),
  status: z.enum(['OPEN', 'CLOSED', 'CANCELLED']),
  capacity: z.number().int().positive(),
  endTime: z.iso.datetime().optional(),
});

export const RegistrationPolicyAppliedPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  policyVersion: z.number().int().positive(),
});

export const RegistrationPolicyRejectedPayloadSchema = z.strictObject({
  eventId: z.uuid(),
  policyVersion: z.number().int().positive(),
  reason: z.enum([
    'CAPACITY_BELOW_OCCUPIED',
    'POLICY_ALREADY_CANCELLED',
    'REGISTRATION_DEADLINE_PASSED',
  ]),
});

export type RegistrationPolicyRequestedPayload = z.infer<
  typeof RegistrationPolicyRequestedPayloadSchema
>;
