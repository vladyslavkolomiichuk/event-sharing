import {
  EventDetailSchema,
  ParticipationHistorySchema,
  type ParticipationHistory,
} from '@event-sharing/contracts';
import { HistoryAccessClient } from '../clients/HistoryAccessClient.js';
import { EventDirectoryClient } from '../clients/EventDirectoryClient.js';
import { ServiceRpcError } from '@event-sharing/messaging';
import { prisma } from '../database/client.js';
import { HistoryUnavailableError } from '../domain/errors/HistoryUnavailableError.js';

export class ParticipationHistoryService {
  constructor(private readonly access = new HistoryAccessClient()) {}

  async hide(
    eventId: string,
    userId: string,
    authorization: string,
  ): Promise<void> {
    const event = await new EventDirectoryClient().get(eventId, authorization);
    if (!['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(event.status))
      throw new ServiceRpcError(
        'Only finished events can be hidden from history.',
        'EVENT_NOT_FINISHED',
        409,
      );
    await prisma.membership.updateMany({
      where: { eventId, userId, status: { in: ['JOINED', 'CANCELLED'] } },
      data: { hiddenAt: new Date() },
    });
  }

  async list(
    userId: string,
    actorId: string,
    authorization: string,
    page: number,
  ): Promise<ParticipationHistory> {
    await this.access.check(userId, authorization);
    const memberships = await prisma.membership.findMany({
      where: {
        userId,
        hiddenAt: null,
        status: { in: ['JOINED', 'CANCELLED'] },
        policy: {
          status: { in: ['CLOSED', 'CANCELLED'] },
          ...(userId === actorId ? {} : { visibility: 'PUBLIC' }),
        },
      },
      orderBy: [{ joinedAt: 'desc' }, { eventId: 'asc' }],
      skip: page * 20,
      take: 21,
    });
    const items = await Promise.all(
      memberships.slice(0, 20).map(async (membership) => {
        const event = await new EventDirectoryClient()
          .get(membership.eventId, authorization)
          .catch((error: unknown) => {
            if (error instanceof ServiceRpcError && error.statusCode === 404)
              return null;
            throw new HistoryUnavailableError();
          });
        if (!event) return null;
        if (!['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(event.status))
          return null;
        if (userId !== actorId && event.visibility !== 'PUBLIC') return null;
        return {
          eventId: event.id,
          title: event.title,
          endTime: event.endTime,
        };
      }),
    );
    return ParticipationHistorySchema.parse({
      items: items.filter((item) => item !== null),
      nextPage: memberships.length > 20 ? page + 1 : null,
    });
  }
}
