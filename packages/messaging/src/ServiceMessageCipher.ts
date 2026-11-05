import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export class ServiceMessageCipher {
  private readonly key: Buffer;
  constructor(key: string) {
    if (!/^[a-f0-9]{64}$/i.test(key))
      throw new Error('A 32-byte service bus key is required.');
    this.key = Buffer.from(key, 'hex');
  }

  encode(value: unknown): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('event-sharing-service-bus-v1'));
    const content = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]).toString('base64');
  }

  decode(value: string): unknown {
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from('event-sharing-service-bus-v1'));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString(),
    );
  }
}
