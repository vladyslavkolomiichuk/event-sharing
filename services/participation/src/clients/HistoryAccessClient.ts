import { z } from 'zod';
import { env } from '../config/env.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { HistoryUnavailableError } from '../domain/errors/HistoryUnavailableError.js';

export class HistoryAccessClient {
  async check(userId: string, authorization: string): Promise<void> {
    const response = await fetch(
      `${env.USERS_SERVICE_URL}/api/users/${userId}/history-access`,
      {
        headers: { authorization },
        signal: AbortSignal.timeout(5000),
      },
    ).catch(() => {
      throw new HistoryUnavailableError();
    });
    if (response.status === 404) throw new ForbiddenError();
    if (!response.ok) throw new HistoryUnavailableError();
    const { allowed } = z
      .strictObject({ allowed: z.boolean() })
      .parse(await response.json());
    if (!allowed) throw new ForbiddenError();
  }
}
