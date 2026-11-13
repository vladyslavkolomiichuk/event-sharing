import { SERVICE_NAMES, type ServiceName } from '@event-sharing/contracts';
import { describe, expect, it } from 'vitest';
import { MailMessageCipher, ServiceMessageCipher } from '../src/index.js';
import { ServicePeerCipher } from '../src/ServicePeerCipher.js';

const KEY = 'ab'.repeat(32);
const OTHER_KEY = 'cd'.repeat(32);
const keys = Object.fromEntries(
  SERVICE_NAMES.map((name) => [name, KEY]),
) as Record<ServiceName, string>;

describe('ServiceMessageCipher', () => {
  it('round-trips JSON values', () => {
    const cipher = new ServiceMessageCipher(KEY);
    const value = { a: 1, b: ['x'] };
    const encoded = cipher.encode(value);
    expect(encoded).not.toContain('"a"');
    expect(cipher.decode(encoded)).toEqual(value);
  });

  it('uses a fresh IV for every message', () => {
    const cipher = new ServiceMessageCipher(KEY);
    expect(cipher.encode('same')).not.toBe(cipher.encode('same'));
  });

  it('rejects other keys and tampered data', () => {
    const encoded = new ServiceMessageCipher(KEY).encode({ a: 1 });
    expect(() => new ServiceMessageCipher(OTHER_KEY).decode(encoded)).toThrow();
    const bytes = Buffer.from(encoded, 'base64');
    bytes[bytes.length - 1]! ^= 1;
    expect(() =>
      new ServiceMessageCipher(KEY).decode(bytes.toString('base64')),
    ).toThrow();
  });

  it('requires a 32-byte hex key', () => {
    expect(() => new ServiceMessageCipher('short')).toThrow(/32-byte/);
  });
});

describe('ServicePeerCipher', () => {
  const auth = new ServicePeerCipher('auth', keys);
  const users = new ServicePeerCipher('users', keys);

  it('delivers a message between peers', () => {
    const packet = auth.encode({ sender: 'auth', target: 'users' });
    expect(users.decode(packet)).toEqual({ sender: 'auth', target: 'users' });
  });

  it('refuses to send as another service', () => {
    expect(() => auth.encode({ sender: 'users', target: 'events' })).toThrow(
      'Unknown service recipient.',
    );
  });

  it('refuses packets for another recipient', () => {
    const packet = auth.encode({ sender: 'auth', target: 'events' });
    expect(() => users.decode(packet)).toThrow('Invalid service recipient.');
  });

  it('detects a spoofed outer sender', () => {
    const packet = JSON.parse(auth.encode({ sender: 'auth', target: 'users' }));
    const spoofed = JSON.stringify({ ...packet, sender: 'events' });
    expect(() => users.decode(spoofed)).toThrow('Invalid service identity.');
  });
});

describe('MailMessageCipher', () => {
  const mail = {
    kind: 'PASSWORD_RESET' as const,
    recipient: 'user@example.test',
    url: 'https://app.test/reset?token=abc',
    expiresAt: '2026-11-14T10:00:00.000Z',
  };

  it('encrypts and decrypts a mail request', () => {
    const cipher = new MailMessageCipher(KEY);
    const payload = cipher.encrypt(mail);
    expect(payload.expiresAt).toBe(mail.expiresAt);
    expect(JSON.stringify(payload)).not.toContain('user@example.test');
    expect(cipher.decrypt(payload)).toEqual(mail);
  });

  it('rejects a changed expiration', () => {
    const cipher = new MailMessageCipher(KEY);
    const payload = cipher.encrypt(mail);
    expect(() =>
      cipher.decrypt({ ...payload, expiresAt: '2030-01-01T00:00:00.000Z' }),
    ).toThrow('Mail request expiration does not match.');
  });

  it('requires a 64 character key', () => {
    expect(() => new MailMessageCipher('00')).toThrow(/MAIL_ENCRYPTION_KEY/);
  });
});
