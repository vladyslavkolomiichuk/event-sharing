import { createServer, type Server, type ServerResponse } from 'node:http';
import pg from 'pg';
import client from 'prom-client';

type MetricsRequest = {
  method?: string;
  originalUrl?: string;
  url?: string;
  baseUrl?: string;
  route?: { path?: unknown };
};

type OutboxState = { pending: number; ageSeconds: number };

const OUTBOX_QUERY = `SELECT count(*)::int AS pending,
  COALESCE(EXTRACT(EPOCH FROM now() - min("occurredAt")), 0)::float AS age
  FROM outbox_event WHERE "publishedAt" IS NULL`;

// Prometheus metrics of one service, served on a separate port.
export class ServiceMetrics {
  readonly registry = new client.Registry();
  private readonly duration: client.Histogram<'method' | 'route' | 'status'>;
  private pool: pg.Pool | undefined;
  private outboxState: Promise<OutboxState> | undefined;
  private server: Server | undefined;

  constructor(readonly service: string) {
    this.registry.setDefaultLabels({ service });
    client.collectDefaultMetrics({ register: this.registry });
    this.duration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests by route pattern and status.',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
  }

  // Records each finished request under its route pattern.
  middleware() {
    return (
      request: MetricsRequest,
      response: ServerResponse,
      next: () => void,
    ): void => {
      const stop = this.duration.startTimer();
      response.once('finish', () =>
        stop({
          method: request.method ?? 'UNKNOWN',
          route: routeLabel(request),
          status: String(response.statusCode),
        }),
      );
      next();
    };
  }

  // Reads the outbox backlog when Prometheus scrapes.
  watchOutbox(databaseUrl: string): void {
    this.pool = new pg.Pool({
      connectionString: databaseUrl,
      max: 1,
      idleTimeoutMillis: 30_000,
      statement_timeout: 2000,
    });
    const read = async (pick: (state: OutboxState) => number) =>
      pick(await this.outbox());
    new client.Gauge({
      name: 'outbox_pending_events',
      help: 'Domain events stored in the outbox but not yet published.',
      registers: [this.registry],
      async collect() {
        this.set(await read((state) => state.pending));
      },
    });
    new client.Gauge({
      name: 'outbox_oldest_pending_age_seconds',
      help: 'Age of the oldest unpublished outbox event.',
      registers: [this.registry],
      async collect() {
        this.set(await read((state) => state.ageSeconds));
      },
    });
  }

  listen(port: number | undefined, host: string): void {
    if (!port) return;
    this.server = createServer((request, response) => {
      if (request.method !== 'GET' || request.url !== '/metrics') {
        response.writeHead(404).end();
        return;
      }
      this.registry
        .metrics()
        .then((body) => {
          response.writeHead(200, {
            'content-type': this.registry.contentType,
          });
          response.end(body);
        })
        .catch(() => response.writeHead(500).end());
    });
    this.server.listen(port, host);
  }

  async close(): Promise<void> {
    const { server, pool } = this;
    this.server = undefined;
    this.pool = undefined;
    await new Promise<void>((done) => {
      if (!server) return done();
      server.close(() => done());
      server.closeAllConnections();
    });
    await pool?.end();
  }

  // One database query serves both outbox gauges of a scrape.
  private outbox(): Promise<OutboxState> {
    this.outboxState ??= this.pool!.query(OUTBOX_QUERY)
      .then(({ rows }) => ({
        pending: Number(rows[0].pending),
        ageSeconds: Number(rows[0].age),
      }))
      .catch(() => ({ pending: Number.NaN, ageSeconds: Number.NaN }))
      .finally(() => setTimeout(() => (this.outboxState = undefined), 1000));
    return this.outboxState;
  }
}

// Route pattern without IDs, so label values stay few.
export function routeLabel(request: MetricsRequest): string {
  const pattern = request.route?.path;
  if (typeof pattern !== 'string') return request.baseUrl || 'unmatched';
  if (pattern.includes('*')) return `${request.baseUrl ?? ''}${pattern}`;
  // An error handler may run after Express restored baseUrl.
  const path = (request.originalUrl ?? request.url ?? '').split('?')[0]!;
  const own = pattern.split('/').filter(Boolean);
  const prefix = path.split('/').filter(Boolean);
  prefix.splice(Math.max(0, prefix.length - own.length));
  return `/${[...prefix, ...own].join('/')}`;
}
