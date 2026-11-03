import {
  EVENT_TYPES,
  MembershipEventPayloadSchema,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { CapacityPolicy } from '../domain/CapacityPolicy.js';
import { MembershipNotFoundError } from '../domain/errors/MembershipNotFoundError.js';
import { PolicyNotFoundError } from '../domain/errors/PolicyNotFoundError.js';
import { InvitationError } from '../domain/errors/InvitationError.js';
import type {
  Membership,
  Prisma,
  RegistrationPolicy,
} from '../generated/prisma/client.js';

export class ParticipationRepository {
  constructor(private readonly capacityPolicy = new CapacityPolicy()) {}

  membership(eventId: string, userId: string) {
    return prisma.membership.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
  }

  async join(
    eventId: string,
    userId: string,
    inviteId?: string,
    tokenHash?: string,
  ): Promise<Membership> {
    return prisma.$transaction(async (transaction) => {
      const policy = await this.lockPolicy(transaction, eventId);

      const existing = await transaction.membership.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (existing?.status === 'JOINED') {
        if (inviteId) {
          await transaction.personalInvite.updateMany({
            where: {
              id: inviteId,
              eventId,
              recipientId: userId,
              status: 'PENDING',
            },
            data: { status: 'ACCEPTED' },
          });
        }
        return existing;
      }

      if (policy.visibility === 'INVITE_ONLY' && !inviteId && !tokenHash) {
        throw new InvitationError(
          'An invitation is required.',
          'INVITATION_REQUIRED',
          403,
        );
      }
      const invite = inviteId
        ? await transaction.personalInvite.findFirst({
            where: {
              id: inviteId,
              eventId,
              recipientId: userId,
              status: 'PENDING',
              expiresAt: { gt: new Date() },
            },
          })
        : null;
      const link = tokenHash
        ? await transaction.inviteLink.findFirst({
            where: {
              eventId,
              tokenHash,
              revokedAt: null,
              expiresAt: { gt: new Date() },
            },
          })
        : null;
      if (
        (inviteId && !invite) ||
        (tokenHash &&
          (!link || (link.maxUses !== null && link.uses >= link.maxUses)))
      ) {
        throw new InvitationError(
          'Invitation is invalid or expired.',
          'INVITATION_INVALID',
          404,
        );
      }
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
      if (invite)
        await transaction.personalInvite.update({
          where: { id: invite.id },
          data: { status: 'ACCEPTED' },
        });
      if (link)
        await transaction.inviteLink.update({
          where: { id: link.id },
          data: { uses: { increment: 1 } },
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
