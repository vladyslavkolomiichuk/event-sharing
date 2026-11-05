import {
  EVENT_TYPES,
  ChatMembershipChangedPayloadSchema,
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
        if (!processed && !previous) {
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
    if (
      event.producer === 'participation' &&
      isMembershipEventType(event.eventType) &&
      result !== 'pending'
    ) {
      await prisma.pendingMembershipEvent.deleteMany({
        where: { id: event.eventId },
      });
      const waiting = await prisma.pendingMembershipEvent.findMany({
        where: { previousEventId: event.eventId },
      });
      for (const item of waiting)
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
    if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
      await prisma.pendingSnapshotEvent.deleteMany({
        where: { id: event.eventId },
      });
      await this.drain(event.eventId);
    }
    return result;
  }

  async recoverPending(): Promise<void> {
    const pending = await prisma.$queryRaw<{ envelope: string }[]>`
      SELECT pending.envelope FROM pending_snapshot_event pending
      WHERE EXISTS (
        SELECT 1 FROM inbox_event inbox
        WHERE inbox.id = pending."previousEventId" OR inbox.id = pending.id
      )
      ORDER BY pending."receivedAt", pending.id
      LIMIT 100
    `;
    for (const item of pending) {
      await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
    let after: string | undefined;
    while (true) {
      const memberships = await prisma.pendingMembershipEvent.findMany({
        where: after ? { id: { gt: after } } : {},
        orderBy: { id: 'asc' },
        take: 100,
      });
      if (!memberships.length) break;
      for (const item of memberships)
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
      after = memberships[memberships.length - 1]!.id;
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
  ): Promise<'processed' | 'duplicate' | 'ignored' | 'pending'> {
    const result = await prisma.$transaction(async (transaction) => {
      if (
        event.producer === 'participation' &&
        isMembershipEventType(event.eventType)
      ) {
        const data = MembershipEventPayloadSchema.parse(event.payload);
        await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${data.eventId}:${data.userId}`}, 0))`;
        if (
          await transaction.inboxEvent.findUnique({
            where: { id: event.eventId },
          })
        )
          return 'duplicate';
        const previousId = data.previousMembershipEventId;
        if (
          previousId &&
          !(await transaction.inboxEvent.findUnique({
            where: { id: previousId },
          }))
        ) {
          await transaction.pendingMembershipEvent.createMany({
            data: {
              id: event.eventId,
              previousEventId: previousId,
              envelope: JSON.stringify(event),
            },
            skipDuplicates: true,
          });
          return 'pending';
        }
      }
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
              status: ['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(
                data.status,
              )
                ? 'READ_ONLY'
                : 'ACTIVE',
            },
            skipDuplicates: true,
          });
        }
        if (['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(data.status)) {
          await transaction.chatRoom.updateMany({
            where: { eventId: data.id, status: 'ACTIVE' },
            data: { status: 'READ_ONLY' },
          });
        }
        return 'processed';
      }
      if (
        event.producer === 'participation' &&
        isMembershipEventType(event.eventType)
      ) {
        const data = MembershipEventPayloadSchema.parse(event.payload);
        const previousId = data.previousMembershipEventId;
        const current = await transaction.membershipProjection.findUnique({
          where: {
            eventId_userId: { eventId: data.eventId, userId: data.userId },
          },
        });
        if (previousId === undefined && current?.lastMembershipEventId)
          return 'ignored';
        if (
          previousId !== undefined &&
          previousId !== (current?.lastMembershipEventId ?? null)
        )
          return 'ignored';
        await transaction.membershipProjection.upsert({
          where: {
            eventId_userId: { eventId: data.eventId, userId: data.userId },
          },
          create: {
            eventId: data.eventId,
            userId: data.userId,
            active: event.eventType === EVENT_TYPES.userJoined,
            joinedAt: new Date(event.occurredAt),
            lastMembershipEventId:
              previousId === undefined ? null : event.eventId,
          },
          update: {
            active: event.eventType === EVENT_TYPES.userJoined,
            ...(previousId === undefined
              ? {}
              : { lastMembershipEventId: event.eventId }),
            ...(event.eventType === EVENT_TYPES.userJoined
              ? { joinedAt: new Date(event.occurredAt) }
              : {}),
          },
        });
        const groupMembers = await transaction.chatRoomMember.findMany({
          where: {
            userId: data.userId,
            status:
              event.eventType === EVENT_TYPES.userJoined ? 'PENDING' : 'ACTIVE',
            room: { eventId: data.eventId, access: 'SELECTED_MEMBERS' },
          },
          include: { room: true },
        });
        for (const member of groupMembers) {
          await transaction.chatRoomMember.update({
            where: {
              roomId_userId: { roomId: member.roomId, userId: data.userId },
            },
            data:
              event.eventType === EVENT_TYPES.userJoined
                ? { status: 'ACTIVE', joinedAt: new Date(event.occurredAt) }
                : { status: 'PENDING', joinedAt: null },
          });
          const active = await transaction.chatRoomMember.findMany({
            where: { roomId: member.roomId, status: 'ACTIVE' },
            select: { userId: true },
          });
          const recipients = new Set([
            ...active.map((item) => item.userId),
            data.userId,
          ]);
          recipients.delete(member.room.createdBy);
          for (const recipientId of recipients) {
            await transaction.outboxEvent.create({
              data: {
                aggregateId: data.eventId,
                eventType: EVENT_TYPES.chatMembershipChanged,
                payload: ChatMembershipChangedPayloadSchema.parse({
                  eventId: data.eventId,
                  roomId: member.roomId,
                  roomName: member.room.name,
                  recipientId,
                  subjectId: data.userId,
                  actorId: member.room.createdBy,
                  change:
                    event.eventType === EVENT_TYPES.userJoined
                      ? 'ADDED'
                      : 'REMOVED',
                }),
              },
            });
          }
        }
        return 'processed';
      }
      return 'ignored';
    });
    if (result === 'processed') {
      try {
        if (
          event.producer === 'auth' &&
          event.eventType === EVENT_TYPES.userNameUpdated
        ) {
          const { userId } = UserNameUpdatedPayloadSchema.parse(event.payload);
          for (const eventId of await this.chats.eventsWithUser(userId)) {
            this.onChanged(await this.chats.participants(eventId), eventId);
          }
        }
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
