import { z } from 'zod';

export const SERVICE_NAMES = [
  'auth',
  'events',
  'participation',
  'messages',
  'notifications',
  'users',
  'storage',
  'geo-search',
  'event-log',
  'gateway',
] as const;
export const ServiceNameSchema = z.enum(SERVICE_NAMES);
export type ServiceName = z.infer<typeof ServiceNameSchema>;

export const RPC_OPERATIONS = {
  session: 'auth.session',
  signingKeys: 'auth.signing-keys',
  readiness: 'service.readiness',
  eventDetail: 'events.detail',
  publicEvent: 'events.public',
  activeEvents: 'events.active',
  profile: 'users.profile',
  invitationTarget: 'users.invitation-target',
  historyAccess: 'users.history-access',
  membership: 'participation.membership',
  privacyReserve: 'privacy.reserve',
  privacyErase: 'privacy.erase',
  privacyExport: 'privacy.export',
} as const;
export const RpcOperationSchema = z.enum(RPC_OPERATIONS);
export type RpcOperation = z.infer<typeof RpcOperationSchema>;

export const RpcRequestSchema = z.strictObject({
  kind: z.literal('request'),
  id: z.uuid(),
  sender: ServiceNameSchema,
  target: ServiceNameSchema,
  operation: RpcOperationSchema,
  deadline: z.number().int(),
  authorization: z.string().max(16384).optional(),
  data: z.unknown(),
});
export type RpcRequest = z.infer<typeof RpcRequestSchema>;
export const RpcResponseSchema = z.strictObject({
  kind: z.literal('response'),
  id: z.uuid(),
  sender: ServiceNameSchema,
  target: ServiceNameSchema,
  operation: RpcOperationSchema,
  data: z.unknown().optional(),
  error: z
    .object({ code: z.string(), message: z.string(), statusCode: z.number() })
    .optional(),
});
export type RpcResponse = z.infer<typeof RpcResponseSchema>;

export const PrivacyWorkSchema = z.strictObject({
  requestId: z.uuid(),
  userId: z.uuid(),
  eventIds: z.array(z.uuid()).default([]),
  removedEventIds: z.array(z.uuid()).default([]),
  mailRequestIds: z.array(z.uuid()).default([]),
});
export type PrivacyWork = z.infer<typeof PrivacyWorkSchema>;
export const PrivacyResultSchema = z.object({
  eventIds: z.array(z.uuid()).default([]),
  removedEventIds: z.array(z.uuid()).default([]),
});
export type PrivacyResult = z.infer<typeof PrivacyResultSchema>;
export const ANONYMOUS_USER_ID = '00000000-0000-4000-8000-000000000000';

export const PrivacyExportPageSchema = z.object({
  requestId: z.uuid(),
  expiresAt: z.number().int().positive(),
  collection: z.number().int().nonnegative().default(0),
  offset: z.number().int().nonnegative().default(0),
  userId: z.uuid(),
});
export const PrivacyExportResultSchema = z.object({
  collection: z.string(),
  rows: z.array(z.record(z.string(), z.unknown())),
  next: z
    .object({ collection: z.number().int(), offset: z.number().int() })
    .nullable(),
});
