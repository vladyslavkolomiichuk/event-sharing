import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  MembershipEventPayloadSchema,
  isMembershipEventType,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class ParticipantAccessRepository {
  async apply(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored' | 'pending'> {
    if (!isMembershipEventType(event.eventType)) return 'ignored';
    const membership = MembershipEventPayloadSchema.parse(event.payload);
    const result = await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${membership.eventId}:${membership.userId}`}, 0))`;
      if (
        await transaction.inboxEvent.findUnique({
          where: { id: event.eventId },
        })
      )
        return 'duplicate';
      const previousId = membership.previousMembershipEventId;
      const previous = previousId
        ? await transaction.inboxEvent.findUnique({ where: { id: previousId } })
        : null;
      const sourceEvent = await transaction.event.findUnique({
        where: { id: membership.eventId },
        select: { id: true },
      });
      if (
        (previousId && !previous) ||
        (!sourceEvent && previousId !== undefined)
      ) {
        await transaction.pendingMembershipEvent.createMany({
          data: {
            id: event.eventId,
            previousEventId: previousId ?? null,
            envelope: JSON.stringify(event),
          },
          skipDuplicates: true,
        });
        return 'pending';
      }
      await transaction.inboxEvent.create({
        data: { id: event.eventId, eventType: event.eventType },
      });
      if (!sourceEvent) return 'ignored';
      const current = await transaction.participantAccess.findUnique({
        where: {
          eventId_userId: {
            eventId: membership.eventId,
            userId: membership.userId,
          },
        },
      });
      if (previousId === undefined && current?.lastMembershipEventId)
        return 'ignored';
      if (
        previousId !== undefined &&
        previousId !== (current?.lastMembershipEventId ?? null)
      )
        return 'ignored';
      await transaction.participantAccess.upsert({
        where: {
          eventId_userId: {
            eventId: membership.eventId,
            userId: membership.userId,
          },
        },
        create: {
          eventId: membership.eventId,
          userId: membership.userId,
          active: event.eventType === EVENT_TYPES.userJoined,
          lastMembershipEventId:
            previousId === undefined ? null : event.eventId,
        },
        update: {
          active: event.eventType === EVENT_TYPES.userJoined,
          ...(previousId === undefined
            ? {}
            : { lastMembershipEventId: event.eventId }),
        },
      });
      return 'processed';
    });
    if (result !== 'pending') {
      await prisma.pendingMembershipEvent.deleteMany({
        where: { id: event.eventId },
      });
      const waiting = await prisma.pendingMembershipEvent.findMany({
        where: { previousEventId: event.eventId },
      });
      for (const item of waiting)
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
    return result;
  }

  async recoverPending(): Promise<void> {
    let after: string | undefined;
    while (true) {
      const pending = await prisma.pendingMembershipEvent.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!pending.length) return;
      for (const item of pending)
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
      after = pending[pending.length - 1]!.id;
    }
  }
}
