import type { RequestHandler } from 'express';
import { createHash } from 'node:crypto';
import { z } from 'zod';
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
  requestDeletion: RequestHandler = async (request, response) => {
    const userId = request.authUser!.id;
    if (await this.eligibility.hasActiveEvents(request.authUser!.internalToken))
      throw new ActiveEventsBlockDeletionError();
    const pending = await this.deletions.request(userId);
    response.status(202).json({
      id: pending.id,
      status: pending.status,
      requestedAt: pending.requestedAt,
      receipt: pending.receipt,
    });
  };

  deletionStatus: RequestHandler = async (request, response) => {
    const receipt = z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .parse(request.get('x-privacy-receipt'));
    const receiptHash = createHash('sha256').update(receipt).digest('hex');
    const job = await prisma.privacyDeletionJob.findUnique({
      where: { receiptHash },
      include: { steps: { select: { completedAt: true } } },
    });
    if (!job)
      return response.status(404).json({
        code: 'NOT_FOUND',
        message: 'Request not found.',
        details: [],
      });
    return response.set('cache-control', 'no-store').json({
      status: job.errorCode
        ? 'REJECTED'
        : job.completedAt
          ? 'COMPLETED'
          : job.frozenAt
            ? 'PROCESSING'
            : 'PENDING',
      requestedAt: job.createdAt,
      completedAt: job.completedAt,
      errorCode: job.errorCode,
      progress: {
        completed: job.steps.filter((step) => step.completedAt).length,
        total: job.steps.length,
      },
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
                  completed: job.steps.filter((step) => step.completedAt)
                    .length,
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
