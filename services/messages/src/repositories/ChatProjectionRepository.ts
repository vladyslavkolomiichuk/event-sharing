import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  EventSnapshotPayloadSchema,
  MembershipEventPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserRegisteredPayloadSchema,
  isEventSnapshotType,
  isMembershipEventType,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { ChatRepository } from './ChatRepository.js';

export class ChatProjectionRepository {
  constructor(
    private readonly onChanged: (
      userIds: string[],
      eventId: string,
    ) => void = () => {},
    private readonly chats = new ChatRepository(),
  ) {}

  async apply(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored' | 'pending'> {
    if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
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
    }
    const result = await this.applyOne(event);
    if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
      await prisma.pendingSnapshotEvent.deleteMany({
        where: { id: event.eventId },
      });
      await this.drain(event.eventId);
    }
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

  private async applyOne(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored'> {
    const result = await prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: event.eventId, eventType: event.eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return 'duplicate';
      if (
        event.producer === 'auth' &&
        event.eventType === EVENT_TYPES.userRegistered
      ) {
        const data = UserRegisteredPayloadSchema.parse(event.payload);
        await transaction.userProjection.upsert({
          where: { id: data.userId },
          create: { id: data.userId, name: data.name ?? 'User' },
          update: { name: data.name ?? 'User' },
        });
        return 'processed';
      }
      if (
        event.producer === 'auth' &&
        event.eventType === EVENT_TYPES.userNameUpdated
      ) {
        const data = UserNameUpdatedPayloadSchema.parse(event.payload);
        await transaction.userProjection.upsert({
          where: { id: data.userId },
          create: { id: data.userId, name: data.name },
          update: { name: data.name },
        });
        return 'processed';
      }
      if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
        const data = EventSnapshotPayloadSchema.parse(event.payload);
        const previous = await transaction.eventProjection.findUnique({
          where: { id: data.id },
        });
        if (previous && previous.version >= data.version) return 'ignored';
        await transaction.eventProjection.upsert({
          where: { id: data.id },
          create: {
            id: data.id,
            organizerId: data.organizerId,
            title: data.title,
            status: data.status,
            chatEnabled: data.chatEnabled,
            version: data.version,
          },
          update: {
            organizerId: data.organizerId,
            title: data.title,
            status: data.status,
            chatEnabled: data.chatEnabled,
            version: data.version,
          },
        });
        if (data.chatEnabled) {
          await transaction.chatRoom.createMany({
            data: {
              eventId: data.id,
              name: 'General',
              createdBy: data.organizerId,
            },
            skipDuplicates: true,
          });
        }
        return 'processed';
      }
      if (
        event.producer === 'participation' &&
        isMembershipEventType(event.eventType)
      ) {
        const data = MembershipEventPayloadSchema.parse(event.payload);
        await transaction.membershipProjection.upsert({
          where: {
            eventId_userId: { eventId: data.eventId, userId: data.userId },
          },
          create: {
            eventId: data.eventId,
            userId: data.userId,
            active: event.eventType === EVENT_TYPES.userJoined,
            joinedAt: new Date(event.occurredAt),
          },
          update: {
            active: event.eventType === EVENT_TYPES.userJoined,
            ...(event.eventType === EVENT_TYPES.userJoined
              ? { joinedAt: new Date(event.occurredAt) }
              : {}),
          },
        });
        return 'processed';
      }
      return 'ignored';
    });
    if (result === 'processed') {
      try {
        if (
          event.producer === 'events' &&
          isEventSnapshotType(event.eventType)
        ) {
          const data = EventSnapshotPayloadSchema.parse(event.payload);
          this.onChanged(await this.chats.participants(data.id), data.id);
        }
        if (
          event.producer === 'participation' &&
          isMembershipEventType(event.eventType)
        ) {
          const data = MembershipEventPayloadSchema.parse(event.payload);
          const recipients = await this.chats.participants(data.eventId);
          this.onChanged([...recipients, data.userId], data.eventId);
        }
      } catch (error) {
        console.error('Messages realtime update failed.', error);
      }
    }
    return result;
  }
}
