import {
  EVENT_TYPES,
  EventEnvelopeSchema,
  EventSnapshotPayloadSchema,
  MembershipEventPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserProfileUpdatedPayloadSchema,
  UserRegisteredPayloadSchema,
  UserRoleChangedPayloadSchema,
  isEventSnapshotType,
  isMembershipEventType,
  type EventEnvelope,
  type EventStatus,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  NotificationRepository,
  type NotificationInput,
} from '../repositories/NotificationRepository.js';
import { ProjectionRepository } from '../repositories/ProjectionRepository.js';

const membershipReadyStatuses = new Set<string>([
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] satisfies EventStatus[]);

export class NotificationEventService {
  constructor(
    private readonly projections = new ProjectionRepository(),
    private readonly notifications = new NotificationRepository(),
    private readonly onChanged: (userIds: string[]) => void = () => {},
  ) {}

  async apply(
    event: EventEnvelope,
  ): Promise<'processed' | 'duplicate' | 'ignored' | 'pending'> {
    if (
      event.producer === 'participation' &&
      isMembershipEventType(event.eventType)
    ) {
      const membership = MembershipEventPayloadSchema.parse(event.payload);
      const processed = await prisma.inboxEvent.findUnique({
        where: { id: event.eventId },
      });
      if (processed) return 'duplicate';
      const projectedEvent = await prisma.eventProjection.findUnique({
        where: { id: membership.eventId },
      });
      const [user, organizer] = await Promise.all([
        prisma.userProjection.findUnique({ where: { id: membership.userId } }),
        projectedEvent
          ? prisma.userProjection.findUnique({
              where: { id: projectedEvent.organizerId },
            })
          : Promise.resolve(null),
      ]);
      if (
        !projectedEvent ||
        !membershipReadyStatuses.has(projectedEvent.status) ||
        !user ||
        !organizer
      ) {
        await prisma.pendingMembershipEvent.createMany({
          data: {
            id: event.eventId,
            eventId: membership.eventId,
            userId: membership.userId,
            envelope: JSON.stringify(event),
          },
          skipDuplicates: true,
        });
        return 'pending';
      }
    }
    if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
      const snapshot = EventSnapshotPayloadSchema.parse(event.payload);
      const previousId = snapshot.previousSnapshotEventId;
      if (previousId) {
        const [processed, previous] = await Promise.all([
          prisma.inboxEvent.findUnique({ where: { id: event.eventId } }),
          prisma.inboxEvent.findUnique({ where: { id: previousId } }),
        ]);
        if (processed) return 'duplicate';
        if (!previous) {
          await prisma.pendingSnapshotEvent.createMany({
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
    }
    const result = await this.applyOne(event);
    if (
      event.producer === 'participation' &&
      isMembershipEventType(event.eventType)
    ) {
      await prisma.pendingMembershipEvent.deleteMany({
        where: { id: event.eventId },
      });
    }
    if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
      await prisma.pendingSnapshotEvent.deleteMany({
        where: { id: event.eventId },
      });
      const snapshot = EventSnapshotPayloadSchema.parse(event.payload);
      await this.drainMembership(snapshot.id);
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
      if (previous) {
        await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
      }
    }
    const memberships = await prisma.pendingMembershipEvent.findMany({
      orderBy: { receivedAt: 'asc' },
      take: 100,
    });
    for (const item of memberships) {
      await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
  }

  private async drainMembership(eventId: string): Promise<void> {
    const pending = await prisma.pendingMembershipEvent.findMany({
      where: { eventId },
      orderBy: { receivedAt: 'asc' },
    });
    for (const item of pending) {
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
    const recipients = new Set<string>();
    const result = await prisma.$transaction(async (transaction) => {
      if (
        !(await this.projections.accept(
          transaction,
          event.eventId,
          event.eventType,
        ))
      ) {
        return 'duplicate';
      }

      if (
        event.eventType === EVENT_TYPES.userRegistered &&
        event.producer === 'auth'
      ) {
        const data = UserRegisteredPayloadSchema.parse(event.payload);
        await this.projections.upsertUser(
          transaction,
          data.userId,
          data.role,
          data.name ?? 'User',
        );
        if (data.role === 'ADMIN') {
          await this.backfillModeration(transaction, data.userId, recipients);
        }
        return 'processed';
      }
      if (
        event.eventType === EVENT_TYPES.userRoleChanged &&
        event.producer === 'auth'
      ) {
        const data = UserRoleChangedPayloadSchema.parse(event.payload);
        await this.projections.updateRole(transaction, data.userId, data.role);
        if (data.role === 'ADMIN') {
          await this.backfillModeration(transaction, data.userId, recipients);
        } else {
          await this.notifications.deleteModerationForUser(
            transaction,
            data.userId,
          );
          recipients.add(data.userId);
        }
        return 'processed';
      }
      if (
        event.eventType === EVENT_TYPES.userNameUpdated &&
        event.producer === 'auth'
      ) {
        const data = UserNameUpdatedPayloadSchema.parse(event.payload);
        await this.projections.updateName(transaction, data.userId, data.name);
        return 'processed';
      }
      if (
        event.eventType === EVENT_TYPES.userProfileUpdated &&
        event.producer === 'users'
      ) {
        const data = UserProfileUpdatedPayloadSchema.parse(event.payload);
        await this.projections.updatePreference(
          transaction,
          data.userId,
          data.notificationsEnabled,
        );
        return 'processed';
      }
      if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
        const data = EventSnapshotPayloadSchema.parse(event.payload);
        const previous = await this.projections.getEvent(transaction, data.id);
        if (previous && previous.version >= data.version) return 'ignored';
        await this.projections.upsertEvent(transaction, {
          id: data.id,
          organizerId: data.organizerId,
          title: data.title,
          status: data.status,
          version: data.version,
          lastSourceEventId: event.eventId,
        });
        if (previous?.status === data.status) return 'processed';

        const href = `/events/${data.id}`;
        let items: NotificationInput[] = [];
        if (data.status === 'MODERATION') {
          const admins = await this.projections.getAdmins(transaction);
          items = admins
            .filter((admin) => admin.id !== data.organizerId)
            .map((admin) => ({
              recipientId: admin.id,
              type: 'EVENT_MODERATION',
              title: 'Event awaiting moderation',
              body: `${data.title} was submitted for review.`,
              href,
              eventId: data.id,
              sourceEventId: event.eventId,
            }));
        } else if (data.status === 'APPROVED' || data.status === 'REJECTED') {
          items = [
            {
              recipientId: data.organizerId,
              type:
                data.status === 'APPROVED'
                  ? 'EVENT_APPROVED'
                  : 'EVENT_REJECTED',
              title:
                data.status === 'APPROVED'
                  ? 'Event approved'
                  : 'Event needs changes',
              body: `${data.title} was ${data.status.toLowerCase()}. Open the event for details.`,
              href,
              eventId: data.id,
              sourceEventId: event.eventId,
            },
          ];
        } else if (data.status === 'CANCELLED') {
          const members = await this.projections.getActiveMembers(
            transaction,
            data.id,
          );
          items = members.map((member) => ({
            recipientId: member.userId,
            type: 'EVENT_CANCELLED',
            title: 'Event cancelled',
            body: `${data.title} was cancelled.`,
            href,
            eventId: data.id,
            sourceEventId: event.eventId,
          }));
        }
        await this.createNotifications(transaction, items, recipients);
        return 'processed';
      }
      if (
        event.producer === 'participation' &&
        isMembershipEventType(event.eventType)
      ) {
        const data = MembershipEventPayloadSchema.parse(event.payload);
        const joined = event.eventType === EVENT_TYPES.userJoined;
        await this.projections.updateMembership(
          transaction,
          data.eventId,
          data.userId,
          joined,
        );
        if (joined) {
          const projectedEvent = await this.projections.getEvent(
            transaction,
            data.eventId,
          );
          if (projectedEvent?.status === 'CANCELLED') {
            await this.createNotifications(
              transaction,
              [
                {
                  recipientId: data.userId,
                  type: 'EVENT_CANCELLED',
                  title: 'Event cancelled',
                  body: `${projectedEvent.title} was cancelled.`,
                  href: `/events/${data.eventId}`,
                  eventId: data.eventId,
                  sourceEventId: projectedEvent.lastSourceEventId,
                },
              ],
              recipients,
            );
            return 'processed';
          }
          const user = await this.projections.getUser(transaction, data.userId);
          const organizer = projectedEvent
            ? await this.projections.getUser(
                transaction,
                projectedEvent.organizerId,
              )
            : null;
          if (
            projectedEvent &&
            organizer?.notificationsEnabled &&
            projectedEvent.organizerId !== data.userId
          ) {
            await this.createNotifications(
              transaction,
              [
                {
                  recipientId: projectedEvent.organizerId,
                  type: 'PARTICIPANT_JOINED',
                  title: 'New participant',
                  body: `${user?.name ?? 'A user'} joined ${projectedEvent.title}.`,
                  href: `/events/${data.eventId}`,
                  senderId: data.userId,
                  eventId: data.eventId,
                  sourceEventId: event.eventId,
                },
              ],
              recipients,
            );
          }
        }
        return 'processed';
      }
      return 'ignored';
    });
    if (recipients.size > 0) this.onChanged([...recipients]);
    return result;
  }

  private async createNotifications(
    transaction: Prisma.TransactionClient,
    items: NotificationInput[],
    recipients: Set<string>,
  ): Promise<void> {
    const count = await this.notifications.createMany(transaction, items);
    if (count > 0) items.forEach((item) => recipients.add(item.recipientId));
  }

  private async backfillModeration(
    transaction: Prisma.TransactionClient,
    adminId: string,
    recipients: Set<string>,
  ) {
    const pending = await this.projections.listPendingModeration(transaction);
    await this.createNotifications(
      transaction,
      pending
        .filter((item) => item.organizerId !== adminId)
        .map((item) => ({
          recipientId: adminId,
          type: 'EVENT_MODERATION',
          title: 'Event awaiting moderation',
          body: `${item.title} was submitted for review.`,
          href: `/events/${item.id}`,
          eventId: item.id,
          sourceEventId: item.lastSourceEventId,
        })),
      recipients,
    );
  }
}
