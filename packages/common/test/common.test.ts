import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { SERVICE_NAMES } from '@event-sharing/contracts';
import {
  AppError,
  DatabaseServiceEnvSchema,
  InternalJwtVerifier,
  PostgresReadinessCheck,
  ServiceBusEnvSchema,
  mapApiError,
} from '../src/index.js';

const pgClient = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  end: vi.fn(),
}));
vi.mock('pg', () => ({
  default: {
    Client: vi.fn(function Client() {
      return pgClient;
    }),
  },
}));

class TestError extends AppError {
  readonly code = 'TEST_ERROR';
  readonly statusCode = 418;
  constructor() {
    super('Test failure.', [{ path: 'field', message: 'Bad value.' }]);
  }
}

const KEY = 'a'.repeat(64);
const ALL_KEYS = Object.fromEntries(SERVICE_NAMES.map((name) => [name, KEY]));

describe('ServiceBusEnvSchema', () => {
  it('parses JSON keys and defaults the namespace', () => {
    const env = ServiceBusEnvSchema.parse({
      SERVICE_BUS_KEYS: JSON.stringify(ALL_KEYS),
    });
    expect(env).toEqual({
      SERVICE_BUS_KEYS: ALL_KEYS,
      SERVICE_BUS_NAMESPACE: 'event-sharing',
    });
  });

  it('rejects keys that are not JSON', () => {
    const result = ServiceBusEnvSchema.safeParse({ SERVICE_BUS_KEYS: '{' });
    expect(result.error?.issues[0]?.message).toBe(
      'SERVICE_BUS_KEYS must be JSON.',
    );
  });

  it('rejects short, missing and unknown service keys', () => {
    expect(
      ServiceBusEnvSchema.safeParse({
        SERVICE_BUS_KEYS: JSON.stringify({ ...ALL_KEYS, auth: 'abc' }),
      }).success,
    ).toBe(false);
    expect(
      ServiceBusEnvSchema.safeParse({
        SERVICE_BUS_KEYS: JSON.stringify({ auth: KEY }),
      }).success,
    ).toBe(false);
    expect(
      ServiceBusEnvSchema.safeParse({
        SERVICE_BUS_KEYS: JSON.stringify({ ...ALL_KEYS, unknown: KEY }),
      }).success,
    ).toBe(false);
  });
});

describe('DatabaseServiceEnvSchema', () => {
  const base = {
    PORT: '4000',
    SERVICE_BUS_KEYS: JSON.stringify(ALL_KEYS),
  };

  it('accepts a PostgreSQL URL and coerces the port', () => {
    const env = DatabaseServiceEnvSchema.parse({
      ...base,
      DATABASE_URL: 'postgresql://user@localhost/db',
    });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
  });

  it('rejects other protocols and bad ports', () => {
    expect(
      DatabaseServiceEnvSchema.safeParse({
        ...base,
        DATABASE_URL: 'mysql://localhost/db',
      }).success,
    ).toBe(false);
    expect(
      DatabaseServiceEnvSchema.safeParse({
        ...base,
        PORT: '70000',
        DATABASE_URL: 'postgres://localhost/db',
      }).success,
    ).toBe(false);
  });
});

describe('loadServiceEnvFile', () => {
  // The shared setup mocks this module, so load the real one.
  const real = () =>
    vi.importActual<typeof import('../src/config/load-service-env-file.js')>(
      '../src/config/load-service-env-file.js',
    );

  it('returns an empty object when the file is missing', async () => {
    const { loadServiceEnvFile } = await real();
    expect(loadServiceEnvFile('file:///nonexistent/a/b/index.js')).toEqual({});
  });

  it('reads the .env file two levels above the module', async () => {
    const { loadServiceEnvFile } = await real();
    const root = mkdtempSync(join(tmpdir(), 'env-'));
    mkdirSync(join(root, 'src', 'config'), { recursive: true });
    writeFileSync(join(root, '.env'), 'PORT=1234\nNAME="x y"\n');
    const moduleUrl = pathToFileURL(join(root, 'src', 'config', 'env.js')).href;
    expect(loadServiceEnvFile(moduleUrl)).toEqual({
      PORT: '1234',
      NAME: 'x y',
    });
    rmSync(root, { recursive: true });
  });
});

describe('mapApiError', () => {
  it('maps malformed JSON bodies', () => {
    const error = Object.assign(new SyntaxError('bad'), { status: 400 });
    expect(mapApiError(error)).toMatchObject({
      statusCode: 400,
      body: { code: 'INVALID_JSON' },
      unexpected: false,
    });
  });

  it('maps validation errors with paths', () => {
    const result = z.object({ a: z.object({ b: z.string() }) }).safeParse({
      a: { b: 1 },
    });
    const mapped = mapApiError(result.error);
    expect(mapped.statusCode).toBe(400);
    expect(mapped.body.code).toBe('VALIDATION_ERROR');
    expect(mapped.body.details[0]?.path).toBe('a.b');
  });

  it('maps application errors with their status and details', () => {
    expect(mapApiError(new TestError())).toEqual({
      statusCode: 418,
      body: {
        code: 'TEST_ERROR',
        message: 'Test failure.',
        details: [{ path: 'field', message: 'Bad value.' }],
      },
      unexpected: false,
    });
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(mapApiError(new Error('secret'))).toMatchObject({
      statusCode: 500,
      body: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      },
      unexpected: true,
    });
  });
});

describe('AppError', () => {
  it('names the error after its subclass', () => {
    const error = new TestError();
    expect(error.name).toBe('TestError');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('PostgresReadinessCheck', () => {
  it('reports ready when a query succeeds', async () => {
    pgClient.connect.mockResolvedValue(undefined);
    pgClient.query.mockResolvedValue({});
    pgClient.end.mockResolvedValue(undefined);
    await expect(
      new PostgresReadinessCheck('postgres://x').check(),
    ).resolves.toBe(true);
    expect(pgClient.end).toHaveBeenCalled();
  });

  it('reports not ready when the connection fails', async () => {
    pgClient.connect.mockRejectedValue(new Error('down'));
    pgClient.end.mockRejectedValue(new Error('not connected'));
    await expect(
      new PostgresReadinessCheck('postgres://x').check(),
    ).resolves.toBe(false);
  });
});

describe('InternalJwtVerifier', () => {
  async function setup() {
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
    const verifier = new InternalJwtVerifier({
      jwks: createLocalJWKSet({ keys: [jwk] }),
      issuer: 'gateway',
      audience: 'events',
    });
    const sign = (claims: Record<string, unknown>, audience = 'events') =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: 'ES256', kid: 'k1' })
        .setIssuer('gateway')
        .setAudience(audience)
        .setSubject(randomUUID())
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    return { verifier, sign };
  }

  it('returns claims for a valid bearer token', async () => {
    const { verifier, sign } = await setup();
    const token = await sign({
      tokenUse: 'internal-user-access',
      role: 'USER',
    });
    const claims = await verifier.verify(`Bearer ${token}`);
    expect(claims?.role).toBe('USER');
  });

  it('returns null for missing, malformed or foreign tokens', async () => {
    const { verifier, sign } = await setup();
    expect(await verifier.verify()).toBeNull();
    expect(await verifier.verify('Basic abc')).toBeNull();
    const foreign = await sign(
      { tokenUse: 'internal-user-access', role: 'USER' },
      'other',
    );
    expect(await verifier.verify(`Bearer ${foreign}`)).toBeNull();
    const wrongUse = await sign({ tokenUse: 'refresh', role: 'USER' });
    expect(await verifier.verify(`Bearer ${wrongUse}`)).toBeNull();
  });
});
