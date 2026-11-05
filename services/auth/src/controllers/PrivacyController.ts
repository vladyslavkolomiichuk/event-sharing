import type { RequestHandler } from 'express';
import { prisma } from '../database/client.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { ActiveEventsBlockDeletionError } from '../domain/errors/ActiveEventsBlockDeletionError.js';
import { DeletionEligibilityClient } from '../clients/DeletionEligibilityClient.js';
import { PrivacyDeletionRepository } from '../repositories/PrivacyDeletionRepository.js';

export class PrivacyController {
  constructor(
    private readonly eligibility = new DeletionEligibilityClient(),
    private readonly deletions = new PrivacyDeletionRepository(),
  ) {}
  export: RequestHandler = async (request, response) => {
    const userId = request.authUser!.id;
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        emailVerified: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const [sessions, accounts] = await Promise.all([
      prisma.session.findMany({
        where: { userId },
        select: {
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
      prisma.account.findMany({
        where: { userId },
        select: { providerId: true, accountId: true, createdAt: true },
      }),
    ]);
    response
      .set('cache-control', 'no-store')
      .json({ user, sessions, accounts });
  };

  requestDeletion: RequestHandler = async (request, response) => {
    const userId = request.authUser!.id;
    if (await this.eligibility.hasActiveEvents(request.authUser!.internalToken))
      throw new ActiveEventsBlockDeletionError();
    const pending = await this.deletions.request(userId);
    response.status(202).json({
      id: pending.id,
      status: pending.status,
      requestedAt: pending.requestedAt,
    });
  };

  deletionRequest: RequestHandler = async (request, response) => {
    const userId = request.authUser!.id;
    const pending = await prisma.privacyRequest.findFirst({
      where: { userId, status: 'PENDING' },
    });
    const job = pending
      ? await prisma.privacyDeletionJob.findUnique({
          where: { requestId: pending.id },
          include: { steps: { select: { completedAt: true } } },
        })
      : null;
    response.set('cache-control', 'no-store').json(
      pending
        ? {
            id: pending.id,
            status: pending.status,
            requestedAt: pending.requestedAt,
            progress: job
              ? {
                  completed: job.steps.filter((step) => step.completedAt).length,
                  total: job.steps.length,
                }
              : null,
          }
        : { status: 'NONE' },
    );
  };

  pendingRequests: RequestHandler = async (request, response) => {
    if (request.authUser?.role !== 'ADMIN') throw new ForbiddenError();
    const requests = await prisma.privacyRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { name: true, username: true, email: true } },
      },
      orderBy: { requestedAt: 'asc' },
      take: 100,
    });
    response.set('cache-control', 'no-store').json({ requests });
  };
}
