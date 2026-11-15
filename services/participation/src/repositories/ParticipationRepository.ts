import {
  EVENT_TYPES,
  MembershipEventPayloadSchema,
} from '@event-sharing/contracts';
import { randomUUID } from 'node:crypto';
import { prisma } from '../database/client.js';
import { CapacityPolicy } from '../domain/CapacityPolicy.js';
import { MembershipNotFoundError } from '../domain/errors/MembershipNotFoundError.js';
import { PolicyNotFoundError } from '../domain/errors/PolicyNotFoundError.js';
import { InvitationError } from '../domain/errors/InvitationError.js';
import { PaymentError } from '../domain/errors/PaymentError.js';
import { refundAllowed } from '../domain/RefundPolicy.js';
import type {
  Membership,
  Prisma,
  RegistrationPolicy,
} from '../generated/prisma/client.js';

export type JoinAccess = { inviteId: string | null; linkId: string | null };

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

      const access = await this.findAccess(
        transaction,
        policy,
        userId,
        inviteId,
        tokenHash,
      );
      if (policy.pricingMode === 'ONLINE') {
        throw new PaymentError(
          'Pay for a ticket to join this event.',
          'PAYMENT_REQUIRED',
          402,
        );
      }
      this.capacityPolicy.assertCanJoin(policy);
      return this.admit(transaction, eventId, userId, existing, access, true);
    });
  }

  // Checks invitation rules and returns the invitation to consume.
  async findAccess(
    transaction: Prisma.TransactionClient,
    policy: RegistrationPolicy,
    userId: string,
    inviteId?: string,
    tokenHash?: string,
  ): Promise<JoinAccess> {
    const eventId = policy.eventId;
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
    return { inviteId: invite?.id ?? null, linkId: link?.id ?? null };
  }

  // Marks the user joined; the caller has checked capacity.
  async admit(
    transaction: Prisma.TransactionClient,
    eventId: string,
    userId: string,
    existing: Membership | null,
    access: JoinAccess,
    takeSeat: boolean,
  ): Promise<Membership> {
    if (existing) {
      await transaction.membership.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status: 'JOINED', joinedAt: new Date(), leftAt: null },
      });
    } else {
      await transaction.membership.create({
        data: { eventId, userId },
      });
    }

    if (takeSeat)
      await transaction.registrationPolicy.update({
        where: { eventId },
        data: { occupied: { increment: 1 } },
      });
    if (access.inviteId)
      await transaction.personalInvite.update({
        where: { id: access.inviteId },
        data: { status: 'ACCEPTED' },
      });
    if (access.linkId)
      await transaction.inviteLink.update({
        where: { id: access.linkId },
        data: { uses: { increment: 1 } },
      });
    const membershipEventId = randomUUID();
    await transaction.outboxEvent.create({
      data: {
        id: membershipEventId,
        aggregateId: eventId,
        eventType: EVENT_TYPES.userJoined,
        payload: MembershipEventPayloadSchema.parse({
          eventId,
          userId,
          previousMembershipEventId: existing?.lastMembershipEventId ?? null,
        }),
      },
    });
    return transaction.membership.update({
      where: { eventId_userId: { eventId, userId } },
      data: { lastMembershipEventId: membershipEventId },
    });
  }

  async leave(eventId: string, userId: string): Promise<Membership> {
    return prisma.$transaction(async (transaction) => {
      const policy = await this.lockPolicy(transaction, eventId);

      const existing = await transaction.membership.findUnique({
        where: { eventId_userId: { eventId, userId } },
      });
      if (!existing) throw new MembershipNotFoundError();
      if (existing.status !== 'JOINED') return existing;

      await transaction.membership.update({
        where: { eventId_userId: { eventId, userId } },
        data: { status: 'LEFT', leftAt: new Date() },
      });
      await transaction.registrationPolicy.update({
        where: { eventId },
        data: { occupied: { decrement: 1 } },
      });
      if (refundAllowed(policy))
        await transaction.payment.updateMany({
          where: { eventId, userId, status: 'PAID' },
          data: { status: 'REFUND_PENDING' },
        });
      const membershipEventId = randomUUID();
      await transaction.outboxEvent.create({
        data: {
          id: membershipEventId,
          aggregateId: eventId,
          eventType: EVENT_TYPES.userLeft,
          payload: MembershipEventPayloadSchema.parse({
            eventId,
            userId,
            previousMembershipEventId: existing.lastMembershipEventId,
          }),
        },
      });
      return transaction.membership.update({
        where: { eventId_userId: { eventId, userId } },
        data: { lastMembershipEventId: membershipEventId },
      });
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
    const where: Prisma.MembershipWhereInput = {
      userId,
      status: 'JOINED',
      hiddenAt: null,
    };
    if (cursor) where.eventId = { gt: cursor };
    return prisma.membership.findMany({
      where,
      orderBy: { eventId: 'asc' },
      take: 21,
    });
  }

  async lockPolicy(
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
