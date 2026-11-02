import { HealthResponseSchema } from '@event-sharing/contracts';

export class ServiceHealthClient {
  constructor(
    readonly service: string,
    private readonly baseUrl: string,
    private readonly timeoutMs = 2000,
  ) {}

  async check(): Promise<'ok' | 'unavailable'> {
    try {
      const response = await fetch(new URL('/ready', this.baseUrl), {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        return 'unavailable';
      }

      return HealthResponseSchema.parse(await response.json()).status;
    } catch {
      return 'unavailable';
    }
  }
}
