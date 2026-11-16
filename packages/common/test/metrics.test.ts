import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServiceMetrics, routeLabel } from '../src/index.js';

const pool = vi.hoisted(() => ({ query: vi.fn(), end: vi.fn() }));
vi.mock('pg', () => ({
  default: {
    Pool: vi.fn(function Pool() {
      return pool;
    }),
  },
}));

const open: Array<ServiceMetrics | Server> = [];
afterEach(async () => {
  for (const item of open.splice(0))
    await (item instanceof ServiceMetrics
      ? item.close()
      : new Promise((done) => item.close(done)));
});

async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await new Promise((done) => server.once('listening', done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

async function scrape(metrics: ServiceMetrics, path = '/metrics') {
  const port = await freePort();
  metrics.listen(port, '127.0.0.1');
  open.push(metrics);
  await vi.waitFor(() => fetch(`http://127.0.0.1:${port}/`));
  return fetch(`http://127.0.0.1:${port}${path}`);
}

describe('routeLabel', () => {
  it('uses the route pattern, never the IDs', () => {
    const id = '7d4f6c2a-1b3e-4f5a-9c8d-0e1f2a3b4c5d';
    const label = (request: object) => routeLabel(request);
    expect(
      label({
        originalUrl: `/api/events/${id}/submit?x=1`,
        baseUrl: '/api/events',
        route: { path: '/:eventId/submit' },
      }),
    ).toBe('/api/events/:eventId/submit');
    // An error handler sees baseUrl restored to the app root.
    expect(
      label({
        originalUrl: `/api/events/${id}`,
        baseUrl: '',
        route: { path: '/:eventId' },
      }),
    ).toBe('/api/events/:eventId');
    expect(
      label({ originalUrl: '/api/events', baseUrl: '', route: { path: '/' } }),
    ).toBe('/api/events');
    expect(
      label({
        originalUrl: '/backend/auth/sign-in/email',
        baseUrl: '',
        route: { path: '/backend/auth/*splat' },
      }),
    ).toBe('/backend/auth/*splat');
    expect(label({ originalUrl: '/api/users/me', baseUrl: '/api/users' })).toBe(
      '/api/users',
    );
    expect(label({ originalUrl: '/wp-admin/setup.php', baseUrl: '' })).toBe(
      'unmatched',
    );
  });
});

describe('ServiceMetrics', () => {
  it('records requests and serves them only on /metrics', async () => {
    const metrics = new ServiceMetrics('events');
    const middleware = metrics.middleware();
    const app = createServer((request, response) =>
      middleware(request, response, () => {
        Object.assign(request, {
          originalUrl: request.url,
          baseUrl: '/api/events',
          route: { path: '/:eventId' },
        });
        response.writeHead(201).end();
      }),
    ).listen(0, '127.0.0.1');
    open.push(app);
    await new Promise((done) => app.once('listening', done));
    const { port } = app.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${port}/api/events/abc`);

    const response = await scrape(metrics);
    expect(response.headers.get('content-type')).toContain('text/plain');
    const body = await response.text();
    expect(body).toContain(
      'http_request_duration_seconds_count{service="events",method="GET",route="/api/events/:eventId",status="201"} 1',
    );
    expect(body).toContain('process_cpu_user_seconds_total');
    expect(body).toContain('nodejs_eventloop_lag_p99_seconds');
  });

  it('answers 404 outside /metrics', async () => {
    expect((await scrape(new ServiceMetrics('users'), '/health')).status).toBe(
      404,
    );
  });

  it('reads the outbox backlog with one query per scrape', async () => {
    pool.query.mockResolvedValue({ rows: [{ pending: 3, age: 12.5 }] });
    const metrics = new ServiceMetrics('events');
    metrics.watchOutbox('postgresql://events@db/events');
    const body = await (await scrape(metrics)).text();
    expect(body).toContain('outbox_pending_events{service="events"} 3');
    expect(body).toContain(
      'outbox_oldest_pending_age_seconds{service="events"} 12.5',
    );
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0]![0]).toContain('"publishedAt" IS NULL');
  });

  it('reports NaN when the database is unreachable', async () => {
    pool.query.mockRejectedValue(new Error('down'));
    const metrics = new ServiceMetrics('users');
    metrics.watchOutbox('postgresql://users@db/users');
    const body = await (await scrape(metrics)).text();
    expect(body).toMatch(/outbox_pending_events\{service="users"\} nan/i);
  });

  it('closes twice without failing', async () => {
    const metrics = new ServiceMetrics('auth');
    metrics.watchOutbox('postgresql://auth@db/auth');
    metrics.listen(await freePort(), '127.0.0.1');
    await metrics.close();
    await metrics.close();
    expect(pool.end).toHaveBeenCalledTimes(1);
  });
});
