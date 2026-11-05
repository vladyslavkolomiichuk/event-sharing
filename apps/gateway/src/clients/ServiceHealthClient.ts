import {
  HealthResponseSchema,
  RPC_OPERATIONS,
  type ServiceName,
} from '@event-sharing/contracts';
import { serviceBus } from '../config/service-bus.js';

export class ServiceHealthClient {
  constructor(
    readonly service: string,
    private readonly target: ServiceName,
    private readonly timeoutMs = 2000,
  ) {}

  async check(): Promise<'ok' | 'unavailable'> {
    try {
      const response = await serviceBus.call(
        this.target,
        RPC_OPERATIONS.readiness,
        {},
        undefined,
        this.timeoutMs,
      );
      return HealthResponseSchema.parse(response).status;
    } catch {
      return 'unavailable';
    }
  }
}
