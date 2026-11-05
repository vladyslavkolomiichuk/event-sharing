import { DELETION_SERVICES } from '@event-sharing/contracts';
import type { DeletionService } from '@event-sharing/contracts';
import { randomUUID } from 'node:crypto';
import { prisma } from '../database/client.js';

export class PrivacyDeletionRepository {
  async request(userId: string) {
    return prisma.$transaction(async (transaction) => {
      const requestId = randomUUID();
      const created = await transaction.privacyRequest.createMany({
        data: { id: requestId, userId },
        skipDuplicates: true,
      });
      if (created.count) {
        await transaction.privacyDeletionJob.create({
          data: {
            requestId,
            userId,
            steps: {
              create: DELETION_SERVICES.map((service, position) => ({
                service,
                position,
              })),
            },
          },
        });
      }
      return transaction.privacyRequest.findFirstOrThrow({
        where: { userId, status: 'PENDING' },
      });
    });
  }

  pendingJobs(after?: string) {
    return prisma.privacyDeletionJob.findMany({
      where: {
        completedAt: null,
        userId: { not: null },
        ...(after ? { requestId: { gt: after } } : {}),
      },
      orderBy: { requestId: 'asc' },
      include: { steps: { orderBy: { position: 'asc' } } },
      take: 100,
    });
  }

  async recordAttempt(requestId: string, service: DeletionService) {
    return prisma.privacyDeletionStep.update({
      where: { requestId_service: { requestId, service } },
      data: { attempts: { increment: 1 }, lastAttemptAt: new Date() },
    });
  }

  async completeStep(requestId: string, service: DeletionService) {
    await prisma.privacyDeletionStep.updateMany({
      where: { requestId, service, completedAt: null },
      data: { completedAt: new Date() },
    });
  }

  async retryLater(
    requestId: string,
    service: DeletionService,
    attempts: number,
  ) {
    const delay = Math.min(300_000, 1000 * 2 ** Math.min(attempts, 8));
    await prisma.privacyDeletionStep.updateMany({
      where: { requestId, service, completedAt: null },
      data: { nextAttemptAt: new Date(Date.now() + delay) },
    });
  }
}
