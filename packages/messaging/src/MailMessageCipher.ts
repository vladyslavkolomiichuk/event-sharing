import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import {
  MailRequestSchema,
  NotificationRequestedPayloadSchema,
  type MailRequest,
  type NotificationRequestedPayload,
} from '@event-sharing/contracts';

export class MailMessageCipher {
  private readonly key: Buffer;

  constructor(hexKey: string) {
    if (!/^[0-9a-f]{64}$/i.test(hexKey)) {
      throw new Error('MAIL_ENCRYPTION_KEY must contain 64 hex characters.');
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  encrypt(input: MailRequest): NotificationRequestedPayload {
    const message = MailRequestSchema.parse(input);
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(message), 'utf8'),
      cipher.final(),
    ]);
    return NotificationRequestedPayloadSchema.parse({
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      expiresAt: message.expiresAt,
    });
  }

  decrypt(input: NotificationRequestedPayload): MailRequest {
    const encrypted = NotificationRequestedPayloadSchema.parse(input);
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      Buffer.from(encrypted.iv, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'base64url'));
    const message = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const parsed = MailRequestSchema.parse(JSON.parse(message));
    if (parsed.expiresAt !== encrypted.expiresAt) {
      throw new Error('Mail request expiration does not match.');
    }
    return parsed;
  }
}
