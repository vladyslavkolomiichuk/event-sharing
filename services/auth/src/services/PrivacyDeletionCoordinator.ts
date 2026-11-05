import {
  DeletionServiceSchema,
  type DeletionService,
} from '@event-sharing/contracts';
import { PostgresOutboxLock } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { ChatDeletionClient } from '../clients/ChatDeletionClient.js';
import { EventDeletionClient } from '../clients/EventDeletionClient.js';
import { PrivacyDeletionRepository } from '../repositories/PrivacyDeletionRepository.js';

type DeletionHandler = (userId: string, requestId: string) => Promise<void>;

export class PrivacyDeletionCoordinator {
  constructor(
    private readonly repository = new PrivacyDeletionRepository(),
    private readonly handlers: Partial<
      Record<DeletionService, DeletionHandler>
    > = {
      'events-reservation': (userId, requestId) =>
        new EventDeletionClient().reserve(userId, requestId),
      messages: (userId, requestId) =>
        new ChatDeletionClient().anonymize(userId, requestId),
    },
    private readonly lock = new PostgresOutboxLock(
      env.DATABASE_URL,
      'privacy-deletion',
    ),
  ) {}

  async runOnce(): Promise<void> {
    await this.lock.run(async () => {
      let after: string | undefined;
      while (true) {
        const jobs = await this.repository.pendingJobs(after);
        if (!jobs.length) break;
        for (const job of jobs) {
          const step = job.steps.find((item) => !item.completedAt);
          if (!job.userId || !step || step.nextAttemptAt > new Date()) continue;
          const parsed = DeletionServiceSchema.safeParse(step.service);
          if (!parsed.success) continue;
          const handler = this.handlers[parsed.data];
          if (!handler) continue;
          const attempt = await this.repository.recordAttempt(
            job.requestId,
            parsed.data,
          );
          try {
            await handler(job.userId, job.requestId);
            await this.repository.completeStep(job.requestId, parsed.data);
          } catch {
            await this.repository.retryLater(
              job.requestId,
              parsed.data,
              attempt.attempts,
            );
          }
        }
        after = jobs[jobs.length - 1]!.requestId;
      }
    });
  }

  async close(): Promise<void> {
    await this.lock.close();
  }
}
