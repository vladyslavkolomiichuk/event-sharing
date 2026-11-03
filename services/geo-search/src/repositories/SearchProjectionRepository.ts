import {
  EventSnapshotPayloadSchema,
  EventEnvelopeSchema,
  isEventSnapshotType,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class SearchProjectionRepository {
  async apply(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored' | 'pending'> {
    if (event.producer !== 'events' || !isEventSnapshotType(event.eventType))
      return 'ignored';
    const snapshot = EventSnapshotPayloadSchema.parse(event.payload);
    if (snapshot.previousSnapshotEventId) {
      const [processed, previous] = await Promise.all([
        prisma.inboxEvent.findUnique({ where: { id: event.eventId } }),
        prisma.inboxEvent.findUnique({
          where: { id: snapshot.previousSnapshotEventId },
        }),
      ]);
      if (processed) return 'duplicate';
      if (!previous) {
        await prisma.pendingSnapshotEvent.createMany({
          data: {
            id: event.eventId,
            previousEventId: snapshot.previousSnapshotEventId,
            envelope: JSON.stringify(event),
          },
          skipDuplicates: true,
        });
        return 'pending';
      }
    }
    const result = await this.applyOne(event);
    await prisma.pendingSnapshotEvent.deleteMany({
      where: { id: event.eventId },
    });
    await this.drain(event.eventId);
    return result;
  }

  async recoverPending(): Promise<void> {
    const pending = await prisma.pendingSnapshotEvent.findMany({
      orderBy: { receivedAt: 'asc' },
      take: 100,
    });
    for (const item of pending) {
      const previous = await prisma.inboxEvent.findUnique({
        where: { id: item.previousEventId },
      });
      if (previous)
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
  }

  private async drain(previousId: string): Promise<void> {
    const pending = await prisma.pendingSnapshotEvent.findMany({
      where: { previousEventId: previousId },
      orderBy: { receivedAt: 'asc' },
    });
    for (const item of pending) {
      await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
  }

  private applyOne(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const snapshot = EventSnapshotPayloadSchema.parse(event.payload);
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: event.eventId, eventType: event.eventType },
        skipDuplicates: true,
      });
      if (!inbox.count) return 'duplicate';
      const previous = await transaction.eventProjection.findUnique({
        where: { id: snapshot.id },
      });
      if (previous && previous.version >= snapshot.version) return 'ignored';
      const publicEvent = snapshot.visibility === 'PUBLIC';
      const publicVenue =
        publicEvent && snapshot.location.visibility === 'PUBLIC';
      const data = {
        organizerId: snapshot.organizerId,
        categoryId: snapshot.categoryId,
        categoryName: snapshot.categoryName ?? null,
        title: snapshot.title,
        description: snapshot.description,
        startTime: new Date(snapshot.startTime),
        endTime: new Date(snapshot.endTime),
        timeZone: snapshot.timeZone,
        status: snapshot.status,
        eventVisibility: snapshot.visibility,
        region: snapshot.location.region,
        visibility: snapshot.location.visibility,
        address: publicVenue ? snapshot.location.address : null,
        latitude: publicEvent ? snapshot.location.latitude : null,
        longitude: publicEvent ? snapshot.location.longitude : null,
        version: snapshot.version,
        updatedAt: new Date(snapshot.updatedAt),
      };
      await transaction.eventProjection.upsert({
        where: { id: snapshot.id },
        create: { id: snapshot.id, ...data },
        update: data,
      });
      return 'processed';
    });
  }
}
