import { DELETION_SERVICES, EVENT_TYPES } from '@event-sharing/contracts';
import type { DeletionService } from '@event-sharing/contracts';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { prisma } from '../database/client.js';

export class PrivacyDeletionRepository {
  async freeze(
    requestId: string,
    context: { eventIds: string[]; removedEventIds: string[] },
  ) {
    await prisma.$transaction(async (tx) => {
      const job = await tx.privacyDeletionJob.findUniqueOrThrow({
        where: { requestId },
      });
      if (!job.userId || job.frozenAt) return;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`privacy-auth:${job.userId}`}, 0))`;
      const mail = await tx.outboxEvent.findMany({
        where: {
          aggregateId: job.userId,
          eventType: EVENT_TYPES.notificationRequested,
        },
        select: { id: true },
      });
      await tx.privacyDeletionJob.update({
        where: { requestId },
        data: {
          frozenAt: new Date(),
          context: { ...context, mailRequestIds: mail.map((item) => item.id) },
        },
      });
      await tx.session.deleteMany({ where: { userId: job.userId } });
      await tx.$executeRaw`DELETE FROM privacy_export_job WHERE "userId" = ${job.userId}::uuid`;
    });
  }

  async finish(requestId: string) {
    await prisma.$transaction(async (tx) => {
      const job = await tx.privacyDeletionJob.findUniqueOrThrow({
        where: { requestId },
        include: { steps: true },
      });
      if (!job.userId || job.completedAt) return;
      if (
        job.steps.some((step) => step.service !== 'auth' && !step.completedAt)
      )
        throw new Error('Deletion acknowledgements are incomplete.');
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(194727202)`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`privacy-auth:${job.userId}`}, 0))`;
      for (const name of ['auth-identity', 'auth-mail'])
        await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('event-sharing-outbox'), hashtext(${name}))`;
      const user = await tx.user.findUnique({ where: { id: job.userId } });
      await tx.$executeRaw`UPDATE outbox_event SET redacted = true, payload = '{}' WHERE ordered AND ("aggregateId" = ${job.userId}::uuid OR payload::text LIKE ${`%${job.userId}%`})`;
      await tx.outboxEvent.deleteMany({
        where: { aggregateId: job.userId, ordered: false },
      });
      await tx.$executeRaw`DELETE FROM outbox_event WHERE NOT ordered AND payload::text LIKE ${`%${job.userId}%`}`;
      await tx.verification.deleteMany({
        where: {
          OR: [
            { value: { contains: job.userId } },
            { identifier: { contains: job.userId } },
            ...(user
              ? [
                  { identifier: user.email },
                  { value: { contains: user.email } },
                ]
              : []),
          ],
        },
      });
      await tx.organizerRequest.updateMany({
        where: { decidedById: job.userId },
        data: { decidedById: null },
      });
      await tx.user.deleteMany({ where: { id: job.userId } });
      await tx.$executeRaw`INSERT INTO privacy_deleted_user ("userId") VALUES (${job.userId}::uuid) ON CONFLICT DO NOTHING`;
      await tx.$executeRaw`DELETE FROM privacy_export_snapshot WHERE "userId" = ${job.userId}::uuid`;
      await tx.privacyDeletionStep.updateMany({
        where: { requestId, service: 'auth' },
        data: { completedAt: new Date() },
      });
      await tx.privacyDeletionJob.update({
        where: { requestId },
        data: { userId: null, context: {}, completedAt: new Date() },
      });
    });
  }

  async reject(requestId: string, errorCode: string) {
    await prisma.$transaction(async (tx) => {
      await tx.privacyRequest.updateMany({
        where: { id: requestId },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      });
      await tx.privacyDeletionJob.update({
        where: { requestId },
        data: { errorCode, userId: null, context: {}, completedAt: new Date() },
      });
    });
  }

  async request(userId: string) {
    return prisma.$transaction(async (transaction) => {
      const receipt = randomBytes(32).toString('base64url');
      const receiptHash = createHash('sha256').update(receipt).digest('hex');
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
            receiptHash,
            confirmedAt: new Date(),
            steps: {
              create: DELETION_SERVICES.map((service, position) => ({
                service,
                position,
              })),
            },
          },
        });
      }
      const request = await transaction.privacyRequest.findFirstOrThrow({
        where: { userId, status: 'PENDING' },
      });
      await transaction.privacyDeletionJob.upsert({
        where: { requestId: request.id },
        update: { receiptHash, confirmedAt: new Date() },
        create: {
          requestId: request.id,
          userId,
          receiptHash,
          confirmedAt: new Date(),
          steps: {
            create: DELETION_SERVICES.map((service, position) => ({
              service,
              position,
            })),
          },
        },
      });
      return { ...request, receipt };
    });
  }

  pendingJobs(after?: string) {
    return prisma.privacyDeletionJob.findMany({
      where: {
        completedAt: null,
        confirmedAt: { not: null },
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
