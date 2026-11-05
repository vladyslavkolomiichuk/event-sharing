import { z } from 'zod';
import { serviceBus } from '../config/service-bus.js';
import { RPC_OPERATIONS } from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { HistoryUnavailableError } from '../domain/errors/HistoryUnavailableError.js';

export class HistoryAccessClient {
  async check(userId: string, authorization: string): Promise<void> {
    const { allowed } = z
      .object({ allowed: z.boolean() })
      .parse(
        await serviceBus.call(
          'users',
          RPC_OPERATIONS.historyAccess,
          { userId },
          authorization,
        ),
      );
    if (!allowed) throw new ForbiddenError();
  }
}
