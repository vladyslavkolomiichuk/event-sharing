import {
  PrivacyWorkSchema,
  PrivacyResultSchema,
  DeletionServiceSchema,
  type ServiceName,
} from '@event-sharing/contracts';
import { PostgresOutboxLock, ServiceRpcError } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { PrivacyServiceClient } from '../clients/PrivacyServiceClient.js';
import { PrivacyDeletionRepository } from '../repositories/PrivacyDeletionRepository.js';

const targets: Record<string, ServiceName> = {
  'events-reservation': 'events',
  participation: 'participation',
  'events-cleanup': 'events',
  messages: 'messages',
  notifications: 'notifications',
  users: 'users',
  storage: 'storage',
  'geo-search': 'geo-search',
  'event-log': 'event-log',
};

export class PrivacyDeletionCoordinator {
  private interval?: NodeJS.Timeout;
  private pending: Promise<void> | undefined;
  constructor(
    private readonly repository = new PrivacyDeletionRepository(),
    private readonly client = new PrivacyServiceClient(),
    private readonly lock = new PostgresOutboxLock(
      env.DATABASE_URL,
      'privacy-deletion',
    ),
  ) {}

  start(): void {
    this.interval = setInterval(() => void this.tick(), 2000);
    void this.tick();
  }

  private async tick(): Promise<void> {
    if (this.pending) return;
    this.pending = this.runOnce();
    try {
      await this.pending;
    } catch {
      console.error('Privacy deletion coordinator will retry.');
    } finally {
      this.pending = undefined;
    }
  }

  async runOnce(): Promise<void> {
    await this.lock.run(async () => {
      let after: string | undefined;
      while (true) {
        const jobs = await this.repository.pendingJobs(after);
        if (!jobs.length) break;
        for (const job of jobs) {
          const step = job.steps.find((item) => !item.completedAt);
          if (!job.userId || !step || step.nextAttemptAt > new Date()) continue;
          // Previously issued user tokens expire before destructive work starts.
          if (job.frozenAt && Date.now() - job.frozenAt.getTime() < 360000)
            continue;
          const service = DeletionServiceSchema.parse(step.service);
          const attempt = await this.repository.recordAttempt(
            job.requestId,
            service,
          );
          try {
            if (service === 'auth') {
              await this.repository.finish(job.requestId);
              continue;
            }
            const work = PrivacyWorkSchema.parse({
              ...(job.context as object),
              requestId: job.requestId,
              userId: job.userId,
            });
            const target = targets[service];
            if (!target) throw new Error('Unknown deletion step.');
            const result = await this.client.erase(
              target,
              work,
              service === 'events-reservation',
            );
            if (service === 'events-reservation')
              await this.repository.freeze(
                job.requestId,
                PrivacyResultSchema.parse(result),
              );
            if (service === 'participation')
              await prisma.privacyDeletionJob.update({
                where: { requestId: job.requestId },
                data: {
                  context: { ...work, ...PrivacyResultSchema.parse(result) },
                },
              });
            await this.repository.completeStep(job.requestId, service);
          } catch (error) {
            if (
              service === 'events-reservation' &&
              error instanceof ServiceRpcError &&
              error.code === 'ACTIVE_EVENTS_BLOCK_DELETION'
            ) {
              await this.repository.reject(job.requestId, error.code);
            } else {
              await this.repository.retryLater(
                job.requestId,
                service,
                attempt.attempts,
              );
              console.error(`Privacy deletion step ${service} will retry.`);
            }
          }
        }
        after = jobs[jobs.length - 1]!.requestId;
      }
    });
  }

  async close(): Promise<void> {
    if (this.interval) clearInterval(this.interval);
    await this.pending;
    await this.lock.close();
  }
}
