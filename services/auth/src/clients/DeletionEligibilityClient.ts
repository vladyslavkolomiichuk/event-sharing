import { z } from 'zod';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { serviceBus } from '../config/service-bus.js';
import { DeletionCheckUnavailableError } from '../domain/errors/DeletionCheckUnavailableError.js';
export class DeletionEligibilityClient {
  async hasActiveEvents(token: string | undefined): Promise<boolean> {
    if (!token) throw new DeletionCheckUnavailableError();
    const result = await serviceBus.call(
      'events',
      RPC_OPERATIONS.activeEvents,
      {},
      'Bearer ' + token,
    );
    return z.object({ hasActiveEvents: z.boolean() }).parse(result)
      .hasActiveEvents;
  }
}
