import {
  EVENT_TYPES,
  RegistrationPolicyAppliedPayloadSchema,
  RegistrationPolicyRejectedPayloadSchema,
  RegistrationPolicyRequestedPayloadSchema,
  type CreateEvent,
  type EventSnapshotType,
  type RegistrationPolicyResultType,
  type UpdateEvent,
  type UserRole,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import {
  EventLifecyclePolicy,
  type EventAction,
} from '../domain/EventLifecyclePolicy.js';
import { CategoryNotFoundError } from '../domain/errors/CategoryNotFoundError.js';
import { EventConflictError } from '../domain/errors/EventConflictError.js';
import { EventNotFoundError } from '../domain/errors/EventNotFoundError.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import type { Event, Prisma } from '../generated/prisma/client.js';
import type { EventWithCategory } from '../models/EventWithCategory.js';
import type { EventListCursor } from '../lib/event-list-cursor.js';
import { EventResponseFactory } from '../services/EventResponseFactory.js';

export type PolicyResult = 'applied' | 'rejected' | 'duplicate' | 'ignored';

const publicStatuses = [
  'PUBLISHED',
  'ONGOING',
  'COMPLETED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export class EventRepository {
  constructor(
    private readonly lifecycle = new EventLifecyclePolicy(),
    private readonly responses = new EventResponseFactory(),
  ) {}

  findById(id: string): Promise<EventWithCategory | null> {
    return prisma.event.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  async reindexPrivateVenueLocations(): Promise<number> {
    const events = await prisma.event.findMany({
      where: {
        visibility: 'PUBLIC',
        locationVisibility: 'PARTICIPANTS_ONLY',
        status: { in: ['PUBLISHED', 'ONGOING'] },
      },
      select: { id: true },
    });
    for (const event of events) {
      await prisma.$transaction(async (transaction) => {
        await this.lockEvent(transaction, event.id);
        const updated = await transaction.event.update({
          where: { id: event.id },
          data: { version: { increment: 1 } },
          include: { category: true },
        });
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventUpdated);
      });
    }
    return events.length;
  }

  listPublic(
    cursor: EventListCursor | null,
    categoryId: string | undefined,
    limit: number,
  ): Promise<EventWithCategory[]> {
    const where: Prisma.EventWhereInput = {
      visibility: 'PUBLIC',
      status: { in: [...publicStatuses] },
    };
    if (categoryId) {
      where.categoryId = categoryId === 'uncategorized' ? null : categoryId;
    }
    if (cursor) where.OR = this.afterCursor(cursor);
    return prisma.event.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  listPublicByOrganizer(
    organizerId: string,
    cursor: EventListCursor | null,
    limit: number,
  ): Promise<EventWithCategory[]> {
    const where: Prisma.EventWhereInput = {
      organizerId,
      visibility: 'PUBLIC',
      status: { in: [...publicStatuses] },
    };
    if (cursor) where.OR = this.afterCursor(cursor);
    return prisma.event.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  listMine(
    organizerId: string,
    cursor: EventListCursor | null,
    limit: number,
  ): Promise<EventWithCategory[]> {
    const where: Prisma.EventWhereInput = { organizerId };
    if (cursor) where.OR = this.afterCursor(cursor);
    return prisma.event.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  listModeration(cursor: EventListCursor | null, limit: number) {
    const where: Prisma.EventWhereInput = { status: 'MODERATION' };
    if (cursor) where.OR = this.afterCursor(cursor);
    return prisma.event.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  }

  countModeration() {
    return prisma.event.count({ where: { status: 'MODERATION' } });
  }

  findAllByOrganizer(organizerId: string): Promise<EventWithCategory[]> {
    return prisma.event.findMany({
      where: { organizerId },
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  private afterCursor(cursor: EventListCursor): Prisma.EventWhereInput[] {
    const createdAt = new Date(cursor.createdAt);
    return [
      { createdAt: { lt: createdAt } },
      { createdAt, id: { lt: cursor.id } },
    ];
  }

  async hasParticipantAccess(
    eventId: string,
    userId: string,
  ): Promise<boolean> {
    const access = await prisma.participantAccess.findUnique({
      where: { eventId_userId: { eventId, userId } },
    });
    return access?.active ?? false;
  }

  async create(
    organizerId: string,
    input: CreateEvent,
  ): Promise<EventWithCategory> {
    if (input.categoryId) {
      const category = await prisma.category.findUnique({
        where: { id: input.categoryId },
      });
      if (!category) throw new CategoryNotFoundError();
    }
    if (Date.parse(input.startTime) <= Date.now()) {
      throw new EventConflictError(
        'EVENT_TIME_INVALID',
        'The event must start in the future.',
      );
    }
    return prisma.event.create({
      data: {
        organizerId,
        categoryId: input.categoryId ?? null,
        title: input.title,
        description: input.description,
        startTime: new Date(input.startTime),
        endTime: new Date(input.endTime),
        timeZone: input.timeZone,
        locationAddress: input.location.address,
        locationRegion: input.location.region ?? null,
        latitude: input.location.latitude,
        longitude: input.location.longitude,
        locationVisibility: input.location.visibility,
        participantLimit: input.participantLimit,
        chatEnabled: input.chatEnabled,
        visibility: input.visibility,
      },
      include: { category: true },
    });
  }

  async update(
    id: string,
    actorId: string,
    role: UserRole,
    patch: UpdateEvent,
  ): Promise<EventWithCategory> {
    return prisma.$transaction(async (transaction) => {
      const event = await this.lockEvent(transaction, id);
      this.assertOwner(event, actorId, role);
      this.assertNoPending(event);
      this.lifecycle.assertEditable(event.status);

      if (
        patch.visibility !== undefined &&
        patch.visibility !== event.visibility &&
        event.policyVersion > 0
      ) {
        throw new EventConflictError(
          'VISIBILITY_LOCKED',
          'Event visibility cannot change after registration opens.',
        );
      }

      if (patch.participantLimit !== undefined && event.policyVersion > 0) {
        if (Object.keys(patch).length !== 1) {
          throw new EventConflictError(
            'POLICY_UPDATE_SEPARATE',
            'Change capacity in a separate request.',
          );
        }
        if (patch.participantLimit === event.participantLimit) return event;
        return this.requestPolicy(
          transaction,
          event,
          event.status,
          event.registrationStatus,
          patch.participantLimit,
          null,
        );
      }

      if (patch.categoryId) {
        const category = await transaction.category.findUnique({
          where: { id: patch.categoryId },
        });
        if (!category) throw new CategoryNotFoundError();
      }
      const startTime = patch.startTime
        ? new Date(patch.startTime)
        : event.startTime;
      const endTime = patch.endTime ? new Date(patch.endTime) : event.endTime;
      const timesChanged =
        startTime.getTime() !== event.startTime.getTime() ||
        endTime.getTime() !== event.endTime.getTime();
      if (
        endTime.getTime() !== event.endTime.getTime() &&
        event.registrationStatus === 'OPEN'
      ) {
        throw new EventConflictError(
          'REGISTRATION_OPEN',
          'Close registration before changing the event end time.',
        );
      }
      if (
        event.status === 'PUBLISHED' &&
        event.startTime <= new Date() &&
        timesChanged
      ) {
        throw new EventConflictError(
          'EVENT_NOT_EDITABLE',
          'Event times cannot be edited after the event has started.',
        );
      }
      if (
        endTime <= startTime ||
        (timesChanged && startTime.getTime() <= Date.now())
      ) {
        throw new EventConflictError(
          'EVENT_TIME_INVALID',
          'Event times must be in the future and end after the start.',
        );
      }

      const data: Prisma.EventUpdateInput = {
        version: { increment: 1 },
        policyError: null,
      };
      if (patch.title !== undefined) data.title = patch.title;
      if (patch.description !== undefined) data.description = patch.description;
      if (patch.categoryId !== undefined) {
        data.category = patch.categoryId
          ? { connect: { id: patch.categoryId } }
          : { disconnect: true };
      }
      if (patch.startTime !== undefined) data.startTime = startTime;
      if (patch.endTime !== undefined) data.endTime = endTime;
      if (patch.timeZone !== undefined) data.timeZone = patch.timeZone;
      if (patch.participantLimit !== undefined)
        data.participantLimit = patch.participantLimit;
      if (patch.chatEnabled !== undefined) data.chatEnabled = patch.chatEnabled;
      if (patch.visibility !== undefined) data.visibility = patch.visibility;
      if (patch.location) {
        data.locationAddress = patch.location.address;
        data.locationRegion = patch.location.region ?? null;
        data.latitude = patch.location.latitude;
        data.longitude = patch.location.longitude;
        data.locationVisibility = patch.location.visibility;
      }
      const updated = await transaction.event.update({
        where: { id },
        data,
        include: { category: true },
      });
      if (this.isPublic(updated.status)) {
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventUpdated);
      }
      return updated;
    });
  }

  async updateChatSetting(
    id: string,
    actorId: string,
    role: UserRole,
    chatEnabled: boolean,
  ): Promise<EventWithCategory> {
    return prisma.$transaction(async (transaction) => {
      const event = await this.lockEvent(transaction, id);
      this.assertOwner(event, actorId, role);
      this.assertNoPending(event);
      if (
        !['DRAFT', 'REJECTED', 'APPROVED', 'PUBLISHED', 'ONGOING'].includes(
          event.status,
        )
      ) {
        throw new EventConflictError(
          'EVENT_NOT_EDITABLE',
          'Event chats cannot be changed in this status.',
        );
      }
      if (event.chatEnabled === chatEnabled) return event;
      const updated = await transaction.event.update({
        where: { id },
        data: { chatEnabled, version: { increment: 1 } },
        include: { category: true },
      });
      if (this.isPublic(updated.status)) {
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventUpdated);
      }
      return updated;
    });
  }

  async transition(
    id: string,
    actorId: string,
    role: UserRole,
    action: EventAction,
    reason: string | null = null,
  ): Promise<EventWithCategory> {
    return prisma.$transaction(async (transaction) => {
      const event = await this.lockEvent(transaction, id);
      this.lifecycle.assertRole(action, role, event.organizerId, actorId);
      this.assertNoPending(event);
      this.lifecycle.assertTransition(action, event.status);

      if (
        action === 'open' &&
        (event.registrationStatus !== 'CLOSED' || event.endTime <= new Date())
      ) {
        throw new EventConflictError(
          'REGISTRATION_CLOSED',
          'Registration cannot be reopened after the event ends or while already open.',
        );
      }
      if (action === 'close' && event.registrationStatus !== 'OPEN') {
        throw new EventConflictError(
          'REGISTRATION_CLOSED',
          'Registration is already closed.',
        );
      }
      if (
        action === 'start' &&
        (event.startTime > new Date() || event.endTime <= new Date())
      ) {
        throw new EventConflictError(
          'EVENT_TIME_INVALID',
          'The event is outside its scheduled time.',
        );
      }
      if (action === 'publish' && event.endTime <= new Date()) {
        throw new EventConflictError(
          'EVENT_TIME_INVALID',
          'The event has already ended.',
        );
      }
      if (action === 'complete' && event.startTime > new Date()) {
        throw new EventConflictError(
          'EVENT_TIME_INVALID',
          'The event has not started yet.',
        );
      }

      if (action === 'open') {
        return this.requestPolicy(
          transaction,
          event,
          event.status,
          'OPEN',
          event.participantLimit,
          null,
        );
      }
      if (action === 'close') {
        return this.requestPolicy(
          transaction,
          event,
          event.status,
          'CLOSED',
          event.participantLimit,
          null,
        );
      }
      if (
        (action === 'cancel' || action === 'complete') &&
        event.policyVersion > 0
      ) {
        return this.requestPolicy(
          transaction,
          event,
          action === 'cancel' ? 'CANCELLED' : 'COMPLETED',
          'CLOSED',
          event.participantLimit,
          reason,
        );
      }

      const targets: Partial<Record<EventAction, Event['status']>> = {
        submit: 'MODERATION',
        approve: 'APPROVED',
        reject: 'REJECTED',
        publish: 'PUBLISHED',
        start: 'ONGOING',
        complete: 'COMPLETED',
        cancel: 'CANCELLED',
        archive: 'ARCHIVED',
      };
      const status = targets[action];
      if (!status) throw new Error(`Unsupported event action: ${action}`);
      const data: Prisma.EventUpdateInput = {
        status,
        version: { increment: 1 },
        policyError: null,
      };
      if (action === 'cancel' || action === 'complete') {
        data.registrationStatus = 'CLOSED';
      }
      if (action === 'reject') data.moderationReason = reason;
      if (action === 'cancel') data.cancellationReason = reason;
      if (action === 'submit') data.moderationReason = null;
      const updated = await transaction.event.update({
        where: { id },
        data,
        include: { category: true },
      });

      if (action === 'publish') {
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventCreated);
      } else if (['submit', 'approve', 'reject'].includes(action)) {
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventUpdated);
      } else if (action === 'cancel' && this.isPublic(event.status)) {
        await this.addSnapshot(
          transaction,
          updated,
          EVENT_TYPES.eventCancelled,
        );
      } else if (this.isPublic(event.status) && this.isPublic(updated.status)) {
        await this.addSnapshot(transaction, updated, EVENT_TYPES.eventUpdated);
      }
      return updated;
    });
  }

  async applyPolicyResult(
    incomingId: string,
    eventType: RegistrationPolicyResultType,
    payload: { eventId: string; policyVersion: number; reason?: string },
  ): Promise<PolicyResult> {
    return prisma.$transaction(async (transaction) => {
      const inbox = await transaction.inboxEvent.createMany({
        data: { id: incomingId, eventType },
        skipDuplicates: true,
      });
      if (inbox.count === 0) return 'duplicate';

      const event = await this.findLockedEvent(transaction, payload.eventId);
      if (!event) return 'ignored';
      if (
        event.pendingPolicyVersion !== payload.policyVersion ||
        !event.pendingStatus ||
        !event.pendingParticipantLimit
      ) {
        return 'ignored';
      }
      if (eventType === EVENT_TYPES.registrationPolicyRejected) {
        const rejected = RegistrationPolicyRejectedPayloadSchema.parse(payload);
        await transaction.event.update({
          where: { id: event.id },
          data: {
            pendingPolicyVersion: null,
            pendingStatus: null,
            pendingRegistrationStatus: null,
            pendingParticipantLimit: null,
            pendingCancellationReason: null,
            policyError: rejected.reason,
            version: { increment: 1 },
          },
        });
        return 'rejected';
      }
      RegistrationPolicyAppliedPayloadSchema.parse(payload);
      const updated = await transaction.event.update({
        where: { id: event.id },
        data: {
          status: event.pendingStatus,
          registrationStatus:
            event.pendingRegistrationStatus ?? event.registrationStatus,
          participantLimit: event.pendingParticipantLimit,
          policyVersion: payload.policyVersion,
          pendingPolicyVersion: null,
          pendingStatus: null,
          pendingRegistrationStatus: null,
          pendingParticipantLimit: null,
          cancellationReason:
            event.pendingStatus === 'CANCELLED'
              ? event.pendingCancellationReason
              : event.cancellationReason,
          pendingCancellationReason: null,
          policyError: null,
          version: { increment: 1 },
        },
        include: { category: true },
      });
      await this.addSnapshot(
        transaction,
        updated,
        updated.status === 'CANCELLED'
          ? EVENT_TYPES.eventCancelled
          : EVENT_TYPES.eventUpdated,
      );
      return 'applied';
    });
  }

  async advanceDueEvents(now = new Date()): Promise<void> {
    const due = await prisma.event.findMany({
      where: {
        pendingPolicyVersion: null,
        OR: [
          { status: { in: ['PUBLISHED', 'ONGOING'] }, endTime: { lte: now } },
          { status: 'PUBLISHED', startTime: { lte: now } },
        ],
      },
      orderBy: { endTime: 'asc' },
      take: 100,
      select: { id: true },
    });

    for (const item of due) {
      await prisma.$transaction(async (transaction) => {
        const event = await this.lockEvent(transaction, item.id);
        if (event.pendingPolicyVersion !== null) return;
        if (!['PUBLISHED', 'ONGOING'].includes(event.status)) return;

        if (event.endTime <= now) {
          if (event.policyVersion > 0) {
            await this.requestPolicy(
              transaction,
              event,
              'COMPLETED',
              'CLOSED',
              event.participantLimit,
              null,
            );
            return;
          }
          const completed = await transaction.event.update({
            where: { id: event.id },
            data: { status: 'COMPLETED', version: { increment: 1 } },
            include: { category: true },
          });
          await this.addSnapshot(
            transaction,
            completed,
            EVENT_TYPES.eventUpdated,
          );
          return;
        }

        if (event.status === 'PUBLISHED' && event.startTime <= now) {
          const ongoing = await transaction.event.update({
            where: { id: event.id },
            data: { status: 'ONGOING', version: { increment: 1 } },
            include: { category: true },
          });
          await this.addSnapshot(
            transaction,
            ongoing,
            EVENT_TYPES.eventUpdated,
          );
        }
      });
    }
  }

  private async requestPolicy(
    transaction: Prisma.TransactionClient,
    event: EventWithCategory,
    pendingStatus: Event['status'],
    pendingRegistrationStatus: Event['registrationStatus'],
    capacity: number,
    cancellationReason: string | null,
  ): Promise<EventWithCategory> {
    const policyStatus =
      pendingStatus === 'CANCELLED' ? 'CANCELLED' : pendingRegistrationStatus;
    const policyVersion = event.policyVersion + 1;
    const updated = await transaction.event.update({
      where: { id: event.id },
      data: {
        pendingStatus,
        pendingRegistrationStatus,
        pendingParticipantLimit: capacity,
        pendingPolicyVersion: policyVersion,
        pendingCancellationReason: cancellationReason,
        policyError: null,
        version: { increment: 1 },
      },
      include: { category: true },
    });
    await transaction.outboxEvent.create({
      data: {
        aggregateId: event.id,
        eventType: EVENT_TYPES.registrationPolicyRequested,
        payload: RegistrationPolicyRequestedPayloadSchema.parse({
          eventId: event.id,
          organizerId: event.organizerId,
          policyVersion,
          status: policyStatus,
          capacity,
          endTime: event.endTime.toISOString(),
          visibility: event.visibility,
          title: event.title,
        }),
      },
    });
    return updated;
  }

  private async addSnapshot(
    transaction: Prisma.TransactionClient,
    event: EventWithCategory,
    eventType: EventSnapshotType,
  ): Promise<void> {
    const participants =
      event.status === 'COMPLETED'
        ? await transaction.participantAccess.findMany({
            where: { eventId: event.id, active: true },
            select: { userId: true },
          })
        : [];
    const snapshot = await transaction.outboxEvent.create({
      data: {
        aggregateId: event.id,
        eventType,
        payload: {
          ...this.responses.publicSnapshot(event),
          previousSnapshotEventId: event.lastSnapshotEventId,
          ...(event.status === 'COMPLETED'
            ? {
                completedParticipantIds: participants.map(
                  (item) => item.userId,
                ),
              }
            : {}),
        },
      },
    });
    await transaction.event.update({
      where: { id: event.id },
      data: { lastSnapshotEventId: snapshot.id },
    });
  }

  private async lockEvent(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<EventWithCategory> {
    const event = await this.findLockedEvent(transaction, id);
    if (!event) throw new EventNotFoundError();
    return event;
  }

  private async findLockedEvent(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<EventWithCategory | null> {
    await transaction.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${id}::uuid FOR UPDATE`;
    return transaction.event.findUnique({
      where: { id },
      include: { category: true },
    });
  }

  private assertOwner(event: Event, actorId: string, role: UserRole): void {
    if (event.organizerId !== actorId && role !== 'ADMIN')
      throw new ForbiddenError();
  }

  private assertNoPending(event: Event): void {
    if (event.pendingPolicyVersion !== null) {
      throw new EventConflictError(
        'POLICY_PENDING',
        'A registration policy change is pending.',
      );
    }
  }

  isPublic(status: Event['status']): boolean {
    return publicStatuses.includes(status as (typeof publicStatuses)[number]);
  }
}
