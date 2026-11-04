import { z } from 'zod';
import { env } from '../config/env.js';
import { DeletionCheckUnavailableError } from '../domain/errors/DeletionCheckUnavailableError.js';

export class DeletionEligibilityClient {
  async hasActiveEvents(token: string | undefined): Promise<boolean> {
    if (!token) throw new DeletionCheckUnavailableError();
    try {
      const response = await fetch(
        `${env.EVENTS_SERVICE_URL}/api/events/mine/deletion-check`,
        {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!response.ok) throw new Error('Event check failed.');
      return z
        .strictObject({ hasActiveEvents: z.boolean() })
        .parse(await response.json()).hasActiveEvents;
    } catch {
      throw new DeletionCheckUnavailableError();
    }
  }
}
