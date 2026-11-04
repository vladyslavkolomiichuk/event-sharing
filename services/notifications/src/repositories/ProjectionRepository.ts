import type {
  EventSnapshotPayload,
  EventType,
  UserRole,
} from '@event-sharing/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';

export class ProjectionRepository {
  async accept(
    transaction: Prisma.TransactionClient,
    eventId: string,
    eventType: EventType,
  ): Promise<boolean> {
    const result = await transaction.inboxEvent.createMany({
      data: { id: eventId, eventType },
      skipDuplicates: true,
    });
    return result.count === 1;
  }

  upsertUser(
    transaction: Prisma.TransactionClient,
    userId: string,
    role: UserRole,
    name: string,
  ) {
    return transaction.userProjection.upsert({
      where: { id: userId },
      create: { id: userId, role, name },
      update: { role, name },
    });
  }

  updateRole(
    transaction: Prisma.TransactionClient,
    userId: string,
    role: UserRole,
  ) {
    return transaction.userProjection.upsert({
      where: { id: userId },
      create: { id: userId, role, name: 'User' },
      update: { role },
    });
  }

  updateName(
    transaction: Prisma.TransactionClient,
    userId: string,
    name: string,
  ) {
    return transaction.userProjection.upsert({
      where: { id: userId },
      create: { id: userId, role: 'USER', name },
      update: { name },
    });
  }

  updatePreference(
    transaction: Prisma.TransactionClient,
    userId: string,
    enabled: boolean,
  ) {
    return transaction.userProjection.upsert({
      where: { id: userId },
      create: {
        id: userId,
        role: 'USER',
        name: 'User',
        notificationsEnabled: enabled,
      },
      update: { notificationsEnabled: enabled },
    });
  }

  getAdmins(transaction: Prisma.TransactionClient) {
    return transaction.userProjection.findMany({ where: { role: 'ADMIN' } });
  }

  recordOrganizerRequest(
    transaction: Prisma.TransactionClient,
    request: {
      id: string;
      requesterId: string;
      requesterName: string;
      sourceEventId: string;
    },
  ) {
    return transaction.pendingOrganizerRequest.upsert({
      where: { id: request.id },
      create: request,
      update: {},
    });
  }

  resolveOrganizerRequest(transaction: Prisma.TransactionClient, id: string) {
    return transaction.pendingOrganizerRequest.deleteMany({ where: { id } });
  }

  getOrganizerRequest(transaction: Prisma.TransactionClient, id: string) {
    return transaction.pendingOrganizerRequest.findUnique({ where: { id } });
  }

  listOrganizerRequests(transaction: Prisma.TransactionClient) {
    return transaction.pendingOrganizerRequest.findMany({
      orderBy: { receivedAt: 'asc' },
    });
  }

  getUser(transaction: Prisma.TransactionClient, userId: string) {
    return transaction.userProjection.findUnique({ where: { id: userId } });
  }

  getEvent(transaction: Prisma.TransactionClient, eventId: string) {
    return transaction.eventProjection.findUnique({ where: { id: eventId } });
  }

  upsertEvent(
    transaction: Prisma.TransactionClient,
    event: Pick<
      EventSnapshotPayload,
      'id' | 'organizerId' | 'title' | 'status' | 'version'
    > & {
      lastSourceEventId: string;
    },
  ) {
    return transaction.eventProjection.upsert({
      where: { id: event.id },
      create: event,
      update: event,
    });
  }

  updateMembership(
    transaction: Prisma.TransactionClient,
    eventId: string,
    userId: string,
    active: boolean,
    lastMembershipEventId?: string,
  ) {
    return transaction.membershipProjection.upsert({
      where: { eventId_userId: { eventId, userId } },
      create: {
        eventId,
        userId,
        active,
        lastMembershipEventId: lastMembershipEventId ?? null,
      },
      update: {
        active,
        ...(lastMembershipEventId ? { lastMembershipEventId } : {}),
      },
    });
  }

  getActiveMembers(transaction: Prisma.TransactionClient, eventId: string) {
    return transaction.membershipProjection.findMany({
      where: { eventId, active: true },
    });
  }

  findUser(userId: string) {
    return prisma.userProjection.findUnique({ where: { id: userId } });
  }

  findEvent(eventId: string) {
    return prisma.eventProjection.findUnique({ where: { id: eventId } });
  }

  listActiveMembers(eventId: string) {
    return prisma.membershipProjection.findMany({
      where: { eventId, active: true },
    });
  }

  listPendingModeration(transaction: Prisma.TransactionClient) {
    return transaction.eventProjection.findMany({
      where: { status: 'MODERATION' },
    });
  }
}
