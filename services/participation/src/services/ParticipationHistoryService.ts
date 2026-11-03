import {
  EventDetailSchema,
  ParticipationHistorySchema,
  type ParticipationHistory,
} from '@event-sharing/contracts';
import { HistoryAccessClient } from '../clients/HistoryAccessClient.js';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { HistoryUnavailableError } from '../domain/errors/HistoryUnavailableError.js';

export class ParticipationHistoryService {
  constructor(private readonly access = new HistoryAccessClient()) {}

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
        status: 'JOINED',
        policy: {
          status: 'CLOSED',
          ...(userId === actorId ? {} : { visibility: 'PUBLIC' }),
        },
      },
      orderBy: [{ joinedAt: 'desc' }, { eventId: 'asc' }],
      skip: page * 20,
      take: 21,
    });
    const items = await Promise.all(
      memberships.slice(0, 20).map(async (membership) => {
        const response = await fetch(
          `${env.EVENTS_SERVICE_URL}/api/events/${membership.eventId}`,
          {
            headers: { authorization },
            signal: AbortSignal.timeout(5000),
          },
        ).catch(() => {
          throw new HistoryUnavailableError();
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new HistoryUnavailableError();
        const event = EventDetailSchema.parse(await response.json());
        if (!['COMPLETED', 'ARCHIVED'].includes(event.status)) return null;
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
