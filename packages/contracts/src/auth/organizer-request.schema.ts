import { z } from 'zod';
import { UsernameSchema } from './user-identity.schema.js';

export const OrganizerRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
]);

export const CreateOrganizerRequestSchema = z.strictObject({
  reason: z.string().trim().min(20).max(1000),
});

export const DecideOrganizerRequestSchema = z.strictObject({
  decisionReason: z.string().trim().max(1000).optional(),
});

export const OrganizerRequestSchema = z.strictObject({
  id: z.uuid(),
  status: OrganizerRequestStatusSchema,
  reason: z.string(),
  decisionReason: z.string().nullable(),
  requestedAt: z.iso.datetime(),
  decidedAt: z.iso.datetime().nullable(),
});

export const AdminOrganizerRequestSchema = OrganizerRequestSchema.extend({
  requester: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    username: UsernameSchema,
  }),
});

export const OrganizerRequestSubmittedPayloadSchema = z.strictObject({
  requestId: z.uuid(),
  userId: z.uuid(),
  name: z.string().min(1),
});

export const OrganizerRequestResolvedPayloadSchema = z.strictObject({
  requestId: z.uuid(),
  userId: z.uuid(),
  decidedById: z.uuid(),
  status: OrganizerRequestStatusSchema.exclude(['PENDING']),
  decisionReason: z.string().nullable(),
});

export type OrganizerRequest = z.infer<typeof OrganizerRequestSchema>;
export type AdminOrganizerRequest = z.infer<typeof AdminOrganizerRequestSchema>;
export type OrganizerRequestStatus = z.infer<
  typeof OrganizerRequestStatusSchema
>;
