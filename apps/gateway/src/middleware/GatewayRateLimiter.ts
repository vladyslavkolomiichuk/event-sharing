import { ApiErrorSchema } from '@event-sharing/contracts';
import type { RequestHandler, Response } from 'express';

type RateLimitEntry = { count: number; resetAt: number };

export class GatewayRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maximumKeys = 10_000,
  ) {}

  middleware(): RequestHandler {
    return (request, response, next) => {
      const now = Date.now();
      const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
      let entry = this.entries.get(key);

      if (!entry || entry.resetAt <= now) {
        if (this.entries.size >= this.maximumKeys) {
          for (const [candidate, current] of this.entries) {
            if (current.resetAt <= now) this.entries.delete(candidate);
          }
        }

        if (this.entries.size >= this.maximumKeys && !entry) {
          this.reject(response, Math.ceil(this.windowMs / 1000));
          return;
        }

        entry = { count: 0, resetAt: now + this.windowMs };
        this.entries.set(key, entry);
      }

      entry.count += 1;
      if (entry.count > this.limit) {
        this.reject(
          response,
          Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
        );
        return;
      }

      next();
    };
  }

  private reject(response: Response, retryAfter: number): void {
    response.setHeader('retry-after', String(retryAfter));
    response.status(429).json(
      ApiErrorSchema.parse({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please try again later.',
        details: [],
      }),
    );
  }
}
