import {
  EVENT_TYPES,
  RegistrationPolicyAppliedPayloadSchema,
  RegistrationPolicyRejectedPayloadSchema,
  RegistrationPolicyRequestedPayloadSchema,
  InvitationSentPayloadSchema,
  type RegistrationPolicyRequestedPayload,
} from '@event-sharing/contracts';
import type { Prisma, RegistrationPolicy } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';

export type PolicyApplyResult =
  'applied' | 'rejected' | 'duplicate' | 'ignored' | 'pending';

export class RegistrationPolicyRepository {
  findByEventId(eventId: string): Promise<RegistrationPolicy | null> {
    return prisma.registrationPolicy.findUnique({ where: { eventId } });
  }

  async apply(
    eventId: string,
    request: RegistrationPolicyRequestedPayload,
  ): Promise<PolicyApplyResult> {
    const result = await this.applyOne(eventId, request);
    if (result !== 'pending' && result !== 'rejected') {
      await this.drain(request.eventId);
    }
    return result;
  }

  async recoverPending(): Promise<void> {
    const pending = await prisma.pendingPolicyEvent.findMany({
      select: { aggregateId: true },
      distinct: ['aggregateId'],
    });
    for (const item of pending) await this.drain(item.aggregateId);
  }

  private async drain(aggregateId: string): Promise<void> {
    while (true) {
      const current = await this.findByEventId(aggregateId);
      const pending = await prisma.pendingPolicyEvent.findUnique({
        where: {
          aggregateId_policyVersion: {
            aggregateId,
            policyVersion: (current?.version ?? 0) + 1,
          },
        },
      });
      if (!pending) return;
      const request = RegistrationPolicyRequestedPayloadSchema.parse(
        pending.payload,
      );
      const result = await this.applyOne(pending.id, request);
      if (result !== 'applied') return;
    }
  }

  private applyOne(
    eventId: string,
    request: RegistrationPolicyRequestedPayload,
  ): Promise<PolicyApplyResult> {
    return prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${request.eventId}))
      `;
      const processed = await transaction.inboxEvent.findUnique({
        where: { id: eventId },
        select: { id: true },
      });
      if (processed) return 'duplicate';
      const current = await transaction.registrationPolicy.findUnique({
        where: { eventId: request.eventId },
      });
      if (current && request.policyVersion <= current.version) {
        await transaction.inboxEvent.create({
          data: {
            id: eventId,
            eventType: EVENT_TYPES.registrationPolicyRequested,
          },
        });
        await transaction.pendingPolicyEvent.deleteMany({
          where: { id: eventId },
        });
        return 'ignored';
      }
      if (request.policyVersion > (current?.version ?? 0) + 1) {
        const pending = await transaction.pendingPolicyEvent.createMany({
          data: {
            id: eventId,
            aggregateId: request.eventId,
            policyVersion: request.policyVersion,
            payload: request,
          },
          skipDuplicates: true,
        });
        if (!pending.count) {
          const same = await transaction.pendingPolicyEvent.findUnique({
            where: { id: eventId },
          });
          if (!same)
            throw new Error('Conflicting registration policy version.');
        }
        return 'pending';
      }

      await transaction.inboxEvent.create({
        data: {
          id: eventId,
          eventType: EVENT_TYPES.registrationPolicyRequested,
        },
      });
      await transaction.pendingPolicyEvent.deleteMany({
        where: { id: eventId },
      });

      if (current?.status === 'CANCELLED') {
        await this.reject(transaction, request, 'POLICY_ALREADY_CANCELLED');
        return 'rejected';
      }
      if (
        request.status === 'OPEN' &&
        request.endTime &&
        new Date(request.endTime) <= new Date()
      ) {
        await this.reject(transaction, request, 'REGISTRATION_DEADLINE_PASSED');
        return 'rejected';
      }
      if (
        current &&
        request.status !== 'CANCELLED' &&
        request.capacity < current.occupied
      ) {
        await this.reject(transaction, request, 'CAPACITY_BELOW_OCCUPIED');
        return 'rejected';
      }

      if (current) {
        if (request.status === 'CANCELLED') {
          await transaction.membership.updateMany({
            where: { eventId: request.eventId, status: 'JOINED' },
            data: { status: 'CANCELLED', leftAt: new Date() },
          });
        }
        await transaction.registrationPolicy.update({
          where: { eventId: request.eventId },
          data: {
            organizerId: request.organizerId,
            version: request.policyVersion,
            status: request.status,
            capacity: request.capacity,
            endTime: request.endTime ? new Date(request.endTime) : null,
            visibility: request.visibility,
            title: request.title,
            occupied: request.status === 'CANCELLED' ? 0 : current.occupied,
          },
        });
      } else {
        await transaction.registrationPolicy.create({
          data: {
            eventId: request.eventId,
            organizerId: request.organizerId,
            version: request.policyVersion,
            status: request.status,
            capacity: request.capacity,
            endTime: request.endTime ? new Date(request.endTime) : null,
            visibility: request.visibility,
            title: request.title,
          },
        });
      }

      if (request.status === 'OPEN') {
        const waiting = await transaction.personalInvite.findMany({
          where: {
            eventId: request.eventId,
            status: 'PENDING',
            notifiedAt: null,
            expiresAt: { gt: new Date() },
          },
        });
        for (const invite of waiting) {
          await transaction.outboxEvent.create({
            data: {
              aggregateId: request.eventId,
              eventType: EVENT_TYPES.invitationSent,
              payload: InvitationSentPayloadSchema.parse({
                eventId: request.eventId,
                recipientId: invite.recipientId,
                organizerId: invite.senderId,
                title: request.title,
              }),
            },
          });
          await transaction.personalInvite.update({
            where: { id: invite.id },
            data: { notifiedAt: new Date() },
          });
        }
      }

      await transaction.outboxEvent.create({
        data: {
          aggregateId: request.eventId,
          eventType: EVENT_TYPES.registrationPolicyApplied,
          payload: RegistrationPolicyAppliedPayloadSchema.parse({
            eventId: request.eventId,
            policyVersion: request.policyVersion,
          }),
        },
      });
      return 'applied';
    });
  }

  private async reject(
    transaction: Prisma.TransactionClient,
    request: RegistrationPolicyRequestedPayload,
    reason:
      | 'CAPACITY_BELOW_OCCUPIED'
      | 'POLICY_ALREADY_CANCELLED'
      | 'REGISTRATION_DEADLINE_PASSED',
  ): Promise<void> {
    await transaction.outboxEvent.create({
      data: {
        aggregateId: request.eventId,
        eventType: EVENT_TYPES.registrationPolicyRejected,
        payload: RegistrationPolicyRejectedPayloadSchema.parse({
          eventId: request.eventId,
          policyVersion: request.policyVersion,
          reason,
        }),
      },
    });
  }
}
