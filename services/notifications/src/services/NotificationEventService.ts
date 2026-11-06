import {
  EVENT_TYPES,
  ANONYMOUS_USER_ID,
  EventEnvelopeSchema,
  EventSnapshotPayloadSchema,
  MembershipEventPayloadSchema,
  UserNameUpdatedPayloadSchema,
  UserProfileUpdatedPayloadSchema,
  UserRegisteredPayloadSchema,
  FriendEventPayloadSchema,
  ChatMembershipChangedPayloadSchema,
  InvitationSentPayloadSchema,
  UserRoleChangedPayloadSchema,
  OrganizerRequestSubmittedPayloadSchema,
  OrganizerRequestResolvedPayloadSchema,
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
      if (processed) {
        await prisma.pendingMembershipEvent.deleteMany({
          where: { id: event.eventId },
        });
        return 'duplicate';
      }
      const previousId = membership.previousMembershipEventId;
      const previous = previousId
        ? await prisma.inboxEvent.findUnique({ where: { id: previousId } })
        : null;
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
        (previousId && !previous) ||
        !projectedEvent ||
        !membershipReadyStatuses.has(projectedEvent.status) ||
        !user ||
        (!organizer && projectedEvent.organizerId !== ANONYMOUS_USER_ID)
      ) {
        await prisma.pendingMembershipEvent.createMany({
          data: {
            id: event.eventId,
            eventId: membership.eventId,
            userId: membership.userId,
            previousEventId: previousId ?? null,
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
        if (!processed && !previous) {
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
      isMembershipEventType(event.eventType) &&
      result !== 'pending'
    ) {
      await prisma.pendingMembershipEvent.deleteMany({
        where: { id: event.eventId },
      });
      await this.drainMembershipSuccessors(event.eventId);
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

  private async drainMembership(eventId: string): Promise<void> {
    const pending = await prisma.pendingMembershipEvent.findMany({
      where: { eventId },
      orderBy: { receivedAt: 'asc' },
    });
    for (const item of pending) {
      await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
    }
  }

  private async drainMembershipSuccessors(
    previousEventId: string,
  ): Promise<void> {
    const pending = await prisma.pendingMembershipEvent.findMany({
      where: { previousEventId },
    });
    for (const item of pending)
      await this.apply(EventEnvelopeSchema.parse(JSON.parse(item.envelope)));
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
    const recipients = new Set<string>();
    const result = await prisma.$transaction(async (transaction) => {
      if (event.producer === 'events' && isEventSnapshotType(event.eventType)) {
        const snapshot = EventSnapshotPayloadSchema.parse(event.payload);
        await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`event-snapshot:${snapshot.id}`}, 0))`;
      }
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
              eventId: data.eventId,
              userId: data.userId,
              previousEventId: previousId,
              envelope: JSON.stringify(event),
            },
            skipDuplicates: true,
          });
          return 'pending';
        }
      }
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
          await this.backfillOrganizerRequests(
            transaction,
            data.userId,
            recipients,
          );
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
          await this.backfillOrganizerRequests(
            transaction,
            data.userId,
            recipients,
          );
        } else {
          await this.notifications.deleteModerationForUser(
            transaction,
            data.userId,
          );
          await this.notifications.deleteRoleRequestsForUser(
            transaction,
            data.userId,
          );
          recipients.add(data.userId);
        }
        return 'processed';
      }
      if (
        event.eventType === EVENT_TYPES.organizerRequestSubmitted &&
        event.producer === 'auth'
      ) {
        const data = OrganizerRequestSubmittedPayloadSchema.parse(
          event.payload,
        );
        await this.projections.recordOrganizerRequest(transaction, {
          id: data.requestId,
          requesterId: data.userId,
          requesterName: data.name,
          sourceEventId: event.eventId,
        });
        const admins = await this.projections.getAdmins(transaction);
        await this.createNotifications(
          transaction,
          admins
            .filter((admin) => admin.id !== data.userId)
            .map((admin) => ({
              recipientId: admin.id,
              senderId: data.userId,
              type: 'ORGANIZER_REQUEST',
              title: 'Organizer access request',
              body: `${data.name} requested organizer access.`,
              href: `/admin/role-requests#organizer-request-${data.requestId}`,
              sourceEventId: event.eventId,
            })),
          recipients,
        );
        return 'processed';
      }
      if (
        event.eventType === EVENT_TYPES.organizerRequestResolved &&
        event.producer === 'auth'
      ) {
        const data = OrganizerRequestResolvedPayloadSchema.parse(event.payload);
        const pendingRequest = await this.projections.getOrganizerRequest(
          transaction,
          data.requestId,
        );
        await this.projections.resolveOrganizerRequest(
          transaction,
          data.requestId,
        );
        if (pendingRequest) {
          await this.notifications.deleteRoleRequestNotifications(
            transaction,
            pendingRequest.sourceEventId,
          );
          const admins = await this.projections.getAdmins(transaction);
          admins.forEach((admin) => recipients.add(admin.id));
        }
        await this.createNotifications(
          transaction,
          [
            {
              recipientId: data.userId,
              type: 'ORGANIZER_REQUEST_DECISION',
              title:
                data.status === 'APPROVED'
                  ? 'Organizer access approved'
                  : 'Organizer access declined',
              body:
                data.status === 'APPROVED'
                  ? 'You can now create events.'
                  : (data.decisionReason ?? 'Your request was declined.'),
              href: data.status === 'APPROVED' ? '/events/new' : '/',
              sourceEventId: event.eventId,
            },
          ],
          recipients,
        );
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
      if (
        event.producer === 'users' &&
        (event.eventType === EVENT_TYPES.friendRequested ||
          event.eventType === EVENT_TYPES.friendAccepted)
      ) {
        const data = FriendEventPayloadSchema.parse(event.payload);
        const requested = event.eventType === EVENT_TYPES.friendRequested;
        await this.createNotifications(
          transaction,
          [
            {
              recipientId: data.recipientId,
              senderId: data.actorId,
              type: requested ? 'FRIEND_REQUEST' : 'FRIEND_ACCEPTED',
              title: requested
                ? 'New friend request'
                : 'Friend request accepted',
              body: requested
                ? `${data.actorName} sent you a friend request.`
                : `${data.actorName} accepted your friend request.`,
              href: requested ? '/friends/received' : '/friends',
              sourceEventId: event.eventId,
            },
          ],
          recipients,
        );
        return 'processed';
      }
      if (
        event.producer === 'participation' &&
        event.eventType === EVENT_TYPES.invitationSent
      ) {
        const data = InvitationSentPayloadSchema.parse(event.payload);
        await this.createNotifications(
          transaction,
          [
            {
              recipientId: data.recipientId,
              senderId: data.organizerId,
              type: 'EVENT_INVITATION',
              title: 'Event invitation',
              body: `You were invited to ${data.title}.`,
              href: '/invitations',
              eventId: data.eventId,
              sourceEventId: event.eventId,
            },
          ],
          recipients,
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
        if (previous?.status === 'MODERATION' && data.status !== 'MODERATION') {
          await this.notifications.deleteModerationForEvent(
            transaction,
            data.id,
          );
          const admins = await this.projections.getAdmins(transaction);
          admins.forEach((admin) => recipients.add(admin.id));
        }
        if (data.detailsChanged) {
          const members = await this.projections.getActiveMembers(
            transaction,
            data.id,
          );
          await this.createNotifications(
            transaction,
            members
              .filter((member) => member.userId !== data.organizerId)
              .map((member) => ({
                recipientId: member.userId,
                type: 'EVENT_UPDATED',
                title: 'Event updated',
                body: `${data.title} was updated. Open the event for details.`,
                href: `/events/${data.id}`,
                eventId: data.id,
                sourceEventId: event.eventId,
              })),
            recipients,
          );
          return 'processed';
        }
        if (previous?.status === data.status && data.status !== 'COMPLETED') {
          return 'processed';
        }

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
        } else if (
          data.status === 'COMPLETED' &&
          data.completedParticipantIds
        ) {
          const recipientIds = new Set([
            data.organizerId,
            ...data.completedParticipantIds,
          ]);
          items = [...recipientIds].map((recipientId) => ({
            recipientId,
            type: 'EVENT_COMPLETED',
            title: 'Event completed',
            body: `${data.title} has ended.`,
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
        await this.projections.updateMembership(
          transaction,
          data.eventId,
          data.userId,
          joined,
          previousId === undefined ? undefined : event.eventId,
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
      if (
        event.producer === 'messages' &&
        event.eventType === EVENT_TYPES.chatMembershipChanged
      ) {
        const data = ChatMembershipChangedPayloadSchema.parse(event.payload);
        const recipient = await this.projections.getUser(
          transaction,
          data.recipientId,
        );
        if (recipient?.notificationsEnabled !== false) {
          const subject = await this.projections.getUser(
            transaction,
            data.subjectId,
          );
          const self = data.recipientId === data.subjectId;
          await this.createNotifications(
            transaction,
            [
              {
                recipientId: data.recipientId,
                type: 'CHAT_GROUP_CHANGED',
                title:
                  data.change === 'ADDED'
                    ? 'Group member added'
                    : 'Group member removed',
                body: self
                  ? `You were ${data.change === 'ADDED' ? 'added to' : 'removed from'} ${data.roomName}.`
                  : `${subject?.name ?? 'A member'} was ${data.change === 'ADDED' ? 'added to' : 'removed from'} ${data.roomName}.`,
                href:
                  data.change === 'REMOVED' && self
                    ? `/events/${data.eventId}`
                    : `/events/${data.eventId}?view=chats`,
                senderId: data.actorId,
                eventId: data.eventId,
                sourceEventId: event.eventId,
              },
            ],
            recipients,
          );
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
    const count = await this.notifications.createMany(
      transaction,
      items.filter((item) => item.recipientId !== ANONYMOUS_USER_ID),
    );
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

  private async backfillOrganizerRequests(
    transaction: Prisma.TransactionClient,
    adminId: string,
    recipients: Set<string>,
  ) {
    const pending = await this.projections.listOrganizerRequests(transaction);
    await this.createNotifications(
      transaction,
      pending
        .filter((item) => item.requesterId !== adminId)
        .map((item) => ({
          recipientId: adminId,
          senderId: item.requesterId,
          type: 'ORGANIZER_REQUEST',
          title: 'Organizer access request',
          body: `${item.requesterName} requested organizer access.`,
          href: `/admin/role-requests#organizer-request-${item.id}`,
          sourceEventId: item.sourceEventId,
        })),
      recipients,
    );
  }
}
