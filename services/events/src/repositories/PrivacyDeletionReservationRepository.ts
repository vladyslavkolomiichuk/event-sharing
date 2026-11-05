import { prisma } from '../database/client.js';
import { EventConflictError } from '../domain/errors/EventConflictError.js';
import type { Prisma } from '../generated/prisma/client.js';

export class PrivacyDeletionReservationRepository {
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
