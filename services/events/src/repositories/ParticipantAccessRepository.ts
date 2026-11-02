import {
  EVENT_TYPES,
  MembershipEventPayloadSchema,
  type MembershipEventType,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class ParticipantAccessRepository {
  async apply(
    incomingId: string,
    eventType: MembershipEventType,
    payload: unknown,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const membership = MembershipEventPayloadSchema.parse(payload);
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: incomingId, eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return 'duplicate';
      const event = await transaction.event.findUnique({
        where: { id: membership.eventId },
        select: { id: true },
      });
      if (!event) return 'ignored';
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
          active: eventType === EVENT_TYPES.userJoined,
        },
        update: { active: eventType === EVENT_TYPES.userJoined },
      });
      return 'processed';
    });
  }
}
