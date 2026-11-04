import { randomUUID } from 'node:crypto';
import {
  EVENT_TYPES,
  needsUsernameSelection,
  type OrganizerRequestStatus,
} from '@event-sharing/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { OrganizerRequestError } from '../domain/errors/OrganizerRequestError.js';

export class OrganizerRequestRepository {
  current(userId: string) {
    return prisma.organizerRequest.findFirst({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  pending() {
    return prisma.organizerRequest.findMany({
      where: { status: 'PENDING' },
      include: { user: { select: { id: true, name: true, username: true } } },
      orderBy: { requestedAt: 'asc' },
      take: 100,
    });
  }

  countPending() {
    return prisma.organizerRequest.count({ where: { status: 'PENDING' } });
  }

  async create(userId: string, reason: string) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: { name: true, username: true, role: true },
        });
        if (!user || needsUsernameSelection(user.username)) {
          throw new OrganizerRequestError(
            'Complete your profile first.',
            'PROFILE_INCOMPLETE',
            403,
          );
        }
        if (user.role !== 'USER') {
          throw new OrganizerRequestError(
            'You already have organizer access.',
            'ROLE_ALREADY_GRANTED',
            409,
          );
        }
        const existing = await transaction.organizerRequest.findFirst({
          where: { userId, status: 'PENDING' },
        });
        if (existing) return existing;

        const request = await transaction.organizerRequest.create({
          data: { id: randomUUID(), userId, reason },
        });
        await transaction.outboxEvent.create({
          data: {
            aggregateId: userId,
            eventType: EVENT_TYPES.organizerRequestSubmitted,
            payload: {
              requestId: request.id,
              userId,
              name: user.name,
            },
          },
        });
        return request;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const existing = await prisma.organizerRequest.findFirst({
          where: { userId, status: 'PENDING' },
        });
        if (existing) return existing;
      }
      throw error;
    }
  }

  decide(
    requestId: string,
    adminId: string,
    status: Exclude<OrganizerRequestStatus, 'PENDING'>,
    decisionReason: string | null,
  ) {
    return prisma.$transaction(async (transaction) => {
      const updated = await transaction.organizerRequest.updateMany({
        where: { id: requestId, status: 'PENDING' },
        data: {
          status,
          decidedById: adminId,
          decidedAt: new Date(),
          decisionReason,
        },
      });
      if (updated.count === 0) {
        throw new OrganizerRequestError(
          'This request is no longer pending.',
          'ROLE_REQUEST_CONFLICT',
          409,
        );
      }
      const request = await transaction.organizerRequest.findUniqueOrThrow({
        where: { id: requestId },
        include: { user: { select: { role: true } } },
      });
      if (status === 'APPROVED' && request.user.role === 'USER') {
        await transaction.user.update({
          where: { id: request.userId },
          data: { role: 'ORGANIZER' },
        });
      }
      await transaction.outboxEvent.create({
        data: {
          aggregateId: request.userId,
          eventType: EVENT_TYPES.organizerRequestResolved,
          payload: {
            requestId,
            userId: request.userId,
            decidedById: adminId,
            status,
            decisionReason,
          },
        },
      });
      return request;
    });
  }
}
