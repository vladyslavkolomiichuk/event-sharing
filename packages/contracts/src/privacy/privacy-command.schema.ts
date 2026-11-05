import { z } from 'zod';

export const PRIVACY_COMMANDS = {
  anonymizeChat: 'anonymize-chat',
} as const;

export const PrivacyCommandSchema = z.strictObject({
  sub: z.uuid(),
  jti: z.uuid(),
  tokenUse: z.literal('privacy-command'),
  operation: z.literal(PRIVACY_COMMANDS.anonymizeChat),
  iss: z.string().min(1),
  aud: z.string().min(1),
  iat: z.number().int().nonnegative(),
  exp: z.number().int().nonnegative(),
});

export const PRIVACY_COMMAND_AUDIENCE = 'event-sharing-privacy-messages';
export type PrivacyCommand = z.infer<typeof PrivacyCommandSchema>;
