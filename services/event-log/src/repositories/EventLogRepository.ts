import type { EventEnvelope } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { EventLogSummaryFactory } from '../domain/EventLogSummaryFactory.js';

export class EventLogRepository {
  async record(
    event: EventEnvelope,
    topic: string,
    partition: number,
    offset: string,
    retentionDays: number,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const position = BigInt(offset);
    return prisma.$transaction(async (transaction) => {
      const progress = await transaction.consumerProgress.findUnique({
        where: { topic_partition: { topic, partition } },
      });
      if (!progress || position > progress.lastOffset) {
        await transaction.consumerProgress.upsert({
          where: { topic_partition: { topic, partition } },
          create: { topic, partition, lastOffset: position },
          update: { lastOffset: position, receivedAt: new Date() },
        });
      }

      const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
      if (new Date(event.occurredAt) < cutoff) return 'ignored';
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: event.eventId },
        skipDuplicates: true,
      });
      if (!inbox.count) return 'duplicate';

      const safe = EventLogSummaryFactory.create(event);
      await transaction.eventLogEntry.create({
        data: {
          id: event.eventId,
          eventType: event.eventType,
          producer: event.producer,
          topic,
          partition,
          offset: position,
          occurredAt: new Date(event.occurredAt),
          actorId: safe.actorId,
          subjectUserId: safe.subjectUserId,
          relatedEventId: safe.relatedEventId,
          summary: safe.summary,
          details: safe.details,
        },
      });
      return 'processed';
    });
  }

  async deleteExpired(retentionDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 86_400_000);
    const [entries] = await prisma.$transaction([
      prisma.eventLogEntry.deleteMany({
        where: { occurredAt: { lt: cutoff } },
      }),
      prisma.inboxEvent.deleteMany({ where: { processedAt: { lt: cutoff } } }),
    ]);
    return entries.count;
  }
}
