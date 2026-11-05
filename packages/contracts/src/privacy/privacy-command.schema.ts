import { z } from 'zod';

export const PRIVACY_COMMANDS = {
  anonymizeChat: 'anonymize-chat',
  reserveEvents: 'reserve-events',
} as const;

export const PrivacyCommandSchema = z.strictObject({
  sub: z.uuid(),
  jti: z.uuid(),
  tokenUse: z.literal('privacy-command'),
  operation: z.enum(PRIVACY_COMMANDS),
  iss: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export const PRIVACY_COMMAND_AUDIENCES = {
  messages: 'event-sharing-privacy-messages',
  events: 'event-sharing-privacy-events',
} as const;
export type PrivacyCommand = z.infer<typeof PrivacyCommandSchema>;
