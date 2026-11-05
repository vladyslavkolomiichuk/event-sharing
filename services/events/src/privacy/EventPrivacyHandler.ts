import { ANONYMOUS_USER_ID, type PrivacyWork } from '@event-sharing/contracts';
import {
  ServicePrivacyHandler,
  ServiceRpcError,
} from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class EventPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'events',
      query: 'SELECT * FROM event WHERE "organizerId" = $1 ORDER BY id',
    },
  ];

  protected override async reserve(tx: PoolClient, work: PrivacyWork) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `privacy-organizer:${work.userId}`,
    ]);
    const active = await tx.query(
      `SELECT id FROM event WHERE "organizerId" = $1 AND (status IN ('PUBLISHED', 'ONGOING') OR "pendingStatus" IN ('PUBLISHED', 'ONGOING')) AND "endTime" > now() LIMIT 1`,
      [work.userId],
    );
    if (active.rowCount)
      throw new ServiceRpcError(
        'Cancel your active events before deleting your account.',
        'ACTIVE_EVENTS_BLOCK_DELETION',
        409,
      );
    await tx.query(
      'INSERT INTO privacy_deletion_reservation ("userId", "requestId") VALUES ($1, $2) ON CONFLICT ("userId") DO NOTHING',
      [work.userId, work.requestId],
    );
    const events = await tx.query<{ id: string }>(
      'SELECT id FROM event WHERE "organizerId" = $1 ORDER BY id',
      [work.userId],
    );
    return {
      eventIds: events.rows.map((event) => event.id),
      removedEventIds: [],
    };
  }

  protected async erase(tx: PoolClient, work: PrivacyWork) {
    const reservation = await tx.query(
      'SELECT 1 FROM privacy_deletion_reservation WHERE "userId" = $1 AND "requestId" = $2',
      [work.userId, work.requestId],
    );
    if (!reservation.rowCount)
      throw new ServiceRpcError(
        'Event reservation is missing.',
        'PRIVACY_RESERVATION_REQUIRED',
        409,
      );
    await tx.query(
      'DELETE FROM participant_access WHERE "userId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    await tx.query(
      'DELETE FROM event WHERE id = ANY($1::uuid[]) AND "organizerId" = $2',
      [work.removedEventIds, work.userId],
    );
    await tx.query(
      `UPDATE event SET "organizerId" = $2, "registrationStatus" = 'CLOSED', "pendingStatus" = NULL, "pendingPolicyVersion" = NULL, "pendingRegistrationStatus" = NULL, "updatedAt" = now() WHERE "organizerId" = $1`,
      [work.userId, ANONYMOUS_USER_ID],
    );
    return { eventIds: work.eventIds, removedEventIds: work.removedEventIds };
  }
}
