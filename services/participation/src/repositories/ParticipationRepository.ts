import {
  EVENT_TYPES,
  MembershipEventPayloadSchema,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { CapacityPolicy } from '../domain/CapacityPolicy.js';
import { MembershipNotFoundError } from '../domain/errors/MembershipNotFoundError.js';
import { PolicyNotFoundError } from '../domain/errors/PolicyNotFoundError.js';
import type {
  Membership,
  Prisma,
  RegistrationPolicy,
} from '../generated/prisma/client.js';

export class ParticipationRepository {
  constructor(private readonly capacityPolicy = new CapacityPolicy()) {}

  async join(eventId: string, userId: string): Promise<Membership> {
    return prisma.$transaction(async (transaction) => {
      const policy = await this.lockPolicy(transaction, eventId);

      const existing = await transaction.membership.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (existing?.status === 'JOINED') return existing;

      this.capacityPolicy.assertCanJoin(policy);

      let membership: Membership;
      if (existing) {
        membership = await transaction.membership.update({
          where: { eventId_userId: { eventId, userId } },
          data: { status: 'JOINED', joinedAt: new Date(), leftAt: null },
        });
      } else {
        membership = await transaction.membership.create({
          data: { eventId, userId },
        });
      }

      await transaction.registrationPolicy.update({
        where: { eventId },
        data: { occupied: { increment: 1 } },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateId: eventId,
          eventType: EVENT_TYPES.userJoined,
          payload: MembershipEventPayloadSchema.parse({ eventId, userId }),
        },
      });
      return membership;
    });
  }

  async leave(eventId: string, userId: string): Promise<Membership> {
    return prisma.$transaction(async (transaction) => {
      await this.lockPolicy(transaction, eventId);

      const existing = await transaction.membership.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (!existing) throw new MembershipNotFoundError();
      if (existing.status !== 'JOINED') return existing;

      const membership = await transaction.membership.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      await transaction.registrationPolicy.update({
        where: { eventId },
        data: { occupied: { decrement: 1 } },
      });
      await transaction.outboxEvent.create({
        data: {
          aggregateId: eventId,
          eventType: EVENT_TYPES.userLeft,
          payload: MembershipEventPayloadSchema.parse({ eventId, userId }),
        },
      });
      return membership;
    });
  }

  listParticipants(
    eventId: string,
    cursor: string | undefined,
  ): Promise<Membership[]> {
    const where: Prisma.MembershipWhereInput = { eventId, status: 'JOINED' };
    if (cursor) where.userId = { gt: cursor };
    return prisma.membership.findMany({
      where,
      orderBy: { userId: 'asc' },
      take: 21,
    });
  }

  listMine(userId: string, cursor: string | undefined): Promise<Membership[]> {
    const where: Prisma.MembershipWhereInput = { userId, status: 'JOINED' };
    if (cursor) where.eventId = { gt: cursor };
    return prisma.membership.findMany({
      where,
      orderBy: { eventId: 'asc' },
      take: 21,
    });
  }

  private async lockPolicy(
    transaction: Prisma.TransactionClient,
    eventId: string,
  ): Promise<RegistrationPolicy> {
    await transaction.$queryRaw`
      SELECT "eventId" FROM "registration_policy"
      WHERE "eventId" = ${eventId}::uuid FOR UPDATE
    `;
    const policy = await transaction.registrationPolicy.findUnique({
      where: { eventId },
    });
    if (!policy) throw new PolicyNotFoundError();
    return policy;
  }
}
