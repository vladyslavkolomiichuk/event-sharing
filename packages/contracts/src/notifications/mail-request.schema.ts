import { z } from 'zod';

export const MailRequestSchema = z.strictObject({
  kind: z.enum(['EMAIL_CHANGE', 'EMAIL_CONFIRMATION', 'PASSWORD_RESET']),
  recipient: z.email(),
  url: z.url(),
  expiresAt: z.iso.datetime(),
});

export type MailRequest = z.infer<typeof MailRequestSchema>;
