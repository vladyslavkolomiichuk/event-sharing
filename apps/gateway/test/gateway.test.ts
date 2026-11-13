import { randomUUID } from 'node:crypto';
import { createServer, ServerResponse, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import express, { type RequestHandler } from 'express';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { send } from '../../../test/helpers.js';

const bus = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock('../src/config/service-bus.js', () => ({ serviceBus: bus }));

const { createApp } = await import('../src/app.js');
const { GatewayRateLimiter } =
  await import('../src/middleware/GatewayRateLimiter.js');
const { createAuthenticateBrowserSession } =
  await import('../src/middleware/authentication.js');
const { AuthServiceClient } =
  await import('../src/clients/AuthServiceClient.js');
const { ServiceHealthClient } =
  await import('../src/clients/ServiceHealthClient.js');
const { ServiceProxy } = await import('../src/proxies/ServiceProxy.js');
const { createAuthProxy } =
  await import('../src/proxies/auth-service.proxy.js');
const { sendProxyError } = await import('../src/proxies/proxy-error.js');

const userId = randomUUID();
const echo =
  (name: string): RequestHandler =>
  (request, response) => {
    response.json({
      proxied: name,
      path: request.path,
      user: request.authenticatedUser ?? null,
    });
  };
const proxies = () => ({
  users: echo('users'),
  events: echo('events'),
  search: echo('search'),
  participation: echo('participation'),
  notifications: echo('notifications'),
  messages: echo('messages'),
  eventLog: echo('eventLog'),
  storage: echo('storage'),
  publicEvents: echo('publicEvents'),
  publicEventImages: echo('publicEventImages'),
});
let identity: { role: string; complete: boolean } | null;
const authenticate: RequestHandler = (request, _response, next) => {
  if (!identity) return next(Object.assign(new Error('x'), {}));
  request.authenticatedUser = { id: userId, role: identity.role as never };
  request.profileComplete = identity.complete;
  request.internalUserJwt = 'internal.jwt';
  next();
};
const app = (clients: never[] = []) =>
  createApp({
    clients,
    authProxy: echo('auth'),
    authenticateBrowserSession: authenticate,
    serviceProxies: proxies(),
  });

beforeEach(() => {
  identity = { role: 'USER', complete: true };
  bus.call.mockReset();
});

describe('routing', () => {
  it('serves health with a request id', async () => {
    const response = await send(app(), 'GET', '/health');
    expect(response.body).toEqual({ service: 'Gateway', status: 'ok' });
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    expect((await send(app(), 'GET', '/ready')).status).toBe(200);
  });

  it('routes each API prefix to its service', async () => {
    const server = app();
    for (const [path, name] of [
      ['/api/users/me', 'users'],
      ['/api/events', 'events'],
      ['/api/search/events', 'search'],
      ['/api/participation/me', 'participation'],
      ['/api/notifications', 'notifications'],
      ['/api/messages/overview', 'messages'],
      ['/api/storage/files', 'storage'],
      ['/auth/get-session', 'auth'],
      ['/api/public/events/map', 'publicEvents'],
      [`/api/public/events/${randomUUID()}/avatar`, 'publicEventImages'],
    ] as const) {
      expect((await send(server, 'GET', path)).body.proxied, path).toBe(name);
    }
  });

  it('blocks the public token endpoint and unknown routes', async () => {
    expect((await send(app(), 'GET', '/auth/token')).status).toBe(404);
    expect((await send(app(), 'GET', '/nope')).body.code).toBe('NOT_FOUND');
    expect((await send(app(), 'POST', '/api/public/events/map')).status).toBe(
      404,
    );
  });

  it('requires a complete profile for the API', async () => {
    identity = { role: 'USER', complete: false };
    const response = await send(app(), 'GET', '/api/events');
    expect(response.status).toBe(403);
    expect(response.body.code).toBe('PROFILE_INCOMPLETE');
  });

  it('limits the event log and system status to admins', async () => {
    expect((await send(app(), 'GET', '/api/event-log/entries')).status).toBe(
      403,
    );
    identity = { role: 'ADMIN', complete: true };
    expect(
      (await send(app(), 'GET', '/api/event-log/entries')).body.proxied,
    ).toBe('eventLog');
    const clients = [
      { service: 'Events', check: async () => 'ok' },
      { service: 'Users', check: async () => 'unavailable' },
    ];
    expect(
      (await send(app(clients as never), 'GET', '/api/system/services')).body,
    ).toEqual({
      services: [
        { service: 'Events', status: 'ok' },
        { service: 'Users', status: 'unavailable' },
      ],
    });
  });

  it('answers CORS preflight for the frontend origin only', async () => {
    const allowed = await send(app(), 'OPTIONS', '/api/events', undefined, {
      origin: 'http://app.test',
      'access-control-request-method': 'PATCH',
    });
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'http://app.test',
    );
    expect(allowed.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('limits credential attempts per client', async () => {
    const server = app();
    const statuses: number[] = [];
    for (let index = 0; index < 11; index++)
      statuses.push(
        (await send(server, 'POST', '/auth/sign-in/email', {})).status,
      );
    expect(statuses.slice(0, 10).every((status) => status === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

describe('GatewayRateLimiter', () => {
  const run = (
    limiter: InstanceType<typeof GatewayRateLimiter>,
    ip = '1.1.1.1',
  ) => {
    const response = {
      headers: {} as Record<string, string>,
      statusCode: 200,
      body: undefined as unknown,
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.body = body;
      },
    };
    const next = vi.fn();
    limiter.middleware()({ ip, socket: {} } as never, response as never, next);
    return { response, next };
  };

  it('allows requests up to the limit and sets retry-after', () => {
    vi.useFakeTimers();
    const limiter = new GatewayRateLimiter(2, 10_000);
    expect(run(limiter).next).toHaveBeenCalled();
    expect(run(limiter).next).toHaveBeenCalled();
    const blocked = run(limiter);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.response.statusCode).toBe(429);
    expect(blocked.response.headers['retry-after']).toBe('10');
    vi.advanceTimersByTime(10_000);
    expect(run(limiter).next).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('counts clients separately and caps tracked keys', () => {
    const limiter = new GatewayRateLimiter(1, 60_000, 2);
    expect(run(limiter, 'a').next).toHaveBeenCalled();
    expect(run(limiter, 'b').next).toHaveBeenCalled();
    expect(run(limiter, 'c').response.statusCode).toBe(429);
  });

  it('uses a custom key when given', () => {
    const limiter = new GatewayRateLimiter(1, 60_000, 10, () => 'same');
    run(limiter, 'a');
    expect(run(limiter, 'b').response.statusCode).toBe(429);
  });
});

describe('session authentication', () => {
  const session = (username: string | null) => ({
    session: { user: { id: userId, role: 'ORGANIZER', username } },
    token: 'internal.jwt',
  });

  it('resolves the identity through Auth', async () => {
    bus.call.mockResolvedValueOnce(session('iryna'));
    expect(await new AuthServiceClient().getSessionIdentity('c=1')).toEqual({
      token: 'internal.jwt',
      username: 'iryna',
      user: { id: userId, role: 'ORGANIZER' },
    });
    expect(bus.call).toHaveBeenCalledWith(
      'auth',
      RPC_OPERATIONS.session,
      { cookie: 'c=1' },
      undefined,
      5000,
    );
  });

  it('returns null without a cookie or session and fails closed on errors', async () => {
    expect(
      await new AuthServiceClient().getSessionIdentity(undefined),
    ).toBeNull();
    bus.call.mockResolvedValueOnce(null);
    expect(await new AuthServiceClient().getSessionIdentity('c')).toBeNull();
    bus.call.mockResolvedValueOnce({ bad: true });
    await expect(
      new AuthServiceClient().getSessionIdentity('c'),
    ).rejects.toMatchObject({ statusCode: 503 });
  });

  it('sets the request identity and profile completeness', async () => {
    const client = { getSessionIdentity: vi.fn() };
    const middleware = createAuthenticateBrowserSession(client as never);
    const request: any = { get: () => 'c' };
    const next = vi.fn();
    client.getSessionIdentity.mockResolvedValueOnce(null);
    await middleware(request, {} as never, next);
    expect(next.mock.calls[0]![0]).toMatchObject({ statusCode: 401 });
    client.getSessionIdentity.mockResolvedValueOnce({
      token: 't',
      username: `user_${'a'.repeat(24)}`,
      user: { id: userId, role: 'USER' },
    });
    await middleware(request, {} as never, next);
    expect(request).toMatchObject({
      internalUserJwt: 't',
      profileComplete: false,
    });
  });
});

describe('ServiceHealthClient', () => {
  it('reports readiness or unavailability', async () => {
    bus.call.mockResolvedValueOnce({ service: 'Events', status: 'ok' });
    expect(await new ServiceHealthClient('Events', 'events').check()).toBe(
      'ok',
    );
    bus.call.mockRejectedValueOnce(new Error('timeout'));
    expect(await new ServiceHealthClient('Events', 'events').check()).toBe(
      'unavailable',
    );
  });
});

describe('proxies', () => {
  let upstream: ReturnType<typeof createServer>;
  let seen: IncomingMessage[] = [];
  let base = '';
  beforeAll(async () => {
    upstream = createServer((request, response) => {
      seen.push(request);
      response.setHeader('set-auth-jwt', 'secret');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ url: request.url }));
    });
    await new Promise<void>((resolve) =>
      upstream.listen(0, '127.0.0.1', resolve),
    );
    base = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
  });
  afterAll(() => upstream.close());
  beforeEach(() => {
    seen = [];
  });

  const mount = (handler: RequestHandler, before?: RequestHandler) => {
    const server = express();
    server.use((request, _response, next) => {
      request.requestId = 'req-1';
      next();
    });
    if (before) server.use(before);
    server.use('/api/events', handler);
    server.use('/auth', handler);
    return server;
  };

  it('strips client credentials and forwards the internal token', async () => {
    const proxy = new ServiceProxy(base, '/api/events', 'Events').create();
    const server = mount(proxy, (request, _response, next) => {
      request.internalUserJwt = 'internal.jwt';
      next();
    });
    const response = await send(server, 'GET', '/api/events/abc', undefined, {
      cookie: 'session=1',
      authorization: 'Bearer forged',
      'x-user-role': 'ADMIN',
    });
    expect(response.body).toEqual({ url: '/api/events/abc' });
    const headers = seen[0]!.headers;
    expect(headers.authorization).toBe('Bearer internal.jwt');
    expect(headers.cookie).toBeUndefined();
    expect(headers['x-user-role']).toBeUndefined();
    expect(headers['x-request-id']).toBe('req-1');
  });

  it('keeps cookies for Auth and hides its internal token header', async () => {
    const server = mount(createAuthProxy(base));
    const response = await send(server, 'GET', '/auth/get-session', undefined, {
      cookie: 'session=1',
      authorization: 'Bearer x',
    });
    expect(response.body).toEqual({ url: '/backend/auth/get-session' });
    expect(response.headers.get('set-auth-jwt')).toBeNull();
    expect(seen[0]!.headers.cookie).toBe('session=1');
    expect(seen[0]!.headers.authorization).toBeUndefined();
  });

  it('answers 502 when the upstream is down', async () => {
    const proxy = new ServiceProxy(
      'http://127.0.0.1:1',
      '/api/events',
      'Events',
    ).create();
    const response = await send(mount(proxy), 'GET', '/api/events');
    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'Events service is unavailable.',
    });
  });

  it('destroys sockets that cannot receive an error body', () => {
    const socket = { destroy: vi.fn() };
    sendProxyError(socket, 'X', 'Y');
    expect(socket.destroy).toHaveBeenCalled();
    const response = new ServerResponse({ method: 'GET' } as never);
    const destroy = vi.spyOn(response, 'destroy');
    Object.defineProperty(response, 'headersSent', { value: true });
    sendProxyError(response, 'X', 'Y');
    expect(destroy).toHaveBeenCalled();
  });
});
