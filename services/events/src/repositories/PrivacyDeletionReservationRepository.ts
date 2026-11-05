import { prisma } from '../database/client.js';
import { EventConflictError } from '../domain/errors/EventConflictError.js';
import type { Prisma } from '../generated/prisma/client.js';

export class PrivacyDeletionReservationRepository {
  async reserve(userId: string, requestId: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await this.lockOrganizer(transaction, userId);
      const existing = await transaction.privacyDeletionReservation.findUnique({
        where: { userId },
      });
      if (existing) {
        if (existing.requestId !== requestId)
          throw new EventConflictError(
            'DELETION_REQUEST_CONFLICT',
            'Another deletion request is already being processed.',
          );
        return;
      }
      const active = await transaction.event.findFirst({
        where: {
          organizerId: userId,
          status: { in: ['PUBLISHED', 'ONGOING'] },
          endTime: { gt: new Date() },
        },
        select: { id: true },
      });
      if (active)
        throw new EventConflictError(
          'ACTIVE_EVENTS_BLOCK_DELETION',
          'Cancel your active events before deleting your account.',
        );
      await transaction.privacyDeletionReservation.create({
        data: { userId, requestId },
      });
    });
  }

  async assertOrganizerAvailable(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await this.lockOrganizer(transaction, userId);
    if (
      await transaction.privacyDeletionReservation.findUnique({
        where: { userId },
      })
    )
      throw new EventConflictError(
        'ACCOUNT_DELETION_IN_PROGRESS',
        'Event creation and publication are unavailable during account deletion.',
      );
  }

  private async lockOrganizer(
    transaction: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`privacy-organizer:${userId}`}, 0))`;
  }
}
