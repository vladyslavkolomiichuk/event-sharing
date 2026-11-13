import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  type CryptoKey,
} from 'jose';

export type TestResponse = {
  status: number;
  body: any;
  headers: Headers;
};

// Sends one request to an app on a random local port.
export async function send(
  app: Express,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<TestResponse> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // Plain text bodies stay as text.
    }
    return { status: response.status, body: parsed, headers: response.headers };
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

export type TestJwt = {
  jwks: ReturnType<typeof createLocalJWKSet>;
  token: (claims?: Record<string, unknown>) => Promise<string>;
};

// Signs internal access tokens the way Auth issues them.
export async function createTestJwt(
  issuer = 'http://auth.test',
  audience = 'event-sharing-services',
): Promise<TestJwt> {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256' };
  const jwks = createLocalJWKSet({ keys: [jwk] });
  const token = (claims: Record<string, unknown> = {}) =>
    sign(privateKey, issuer, audience, claims);
  return { jwks, token };
}

function sign(
  key: CryptoKey,
  issuer: string,
  audience: string,
  claims: Record<string, unknown>,
) {
  const { sub = randomUUID(), ...rest } = claims;
  return new SignJWT({
    tokenUse: 'internal-user-access',
    role: 'USER',
    ...rest,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'test' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject(String(sub))
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}
