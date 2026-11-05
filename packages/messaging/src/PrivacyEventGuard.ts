import {
  ANONYMOUS_USER_ID,
  EVENT_TYPES,
  type EventEnvelope,
} from '@event-sharing/contracts';
import { Pool } from 'pg';
import { PRIVACY_LOCK } from './PrivacyDatabase.js';

// All projection writes and queue recovery share the deletion barrier.
export class PrivacyEventGuard {
  private readonly pool: Pool;
  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: 3,
      allowExitOnIdle: true,
    });
  }

  async run<T>(
    event: EventEnvelope,
    apply: (event: EventEnvelope) => Promise<T>,
  ): Promise<T | 'ignored'> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock_shared($1)', [PRIVACY_LOCK]);
      if (event.redacted) return 'ignored';
      const data = event.payload as Record<string, unknown>;
      const ids = Object.entries(data)
        .filter(
          ([key, value]) =>
            /^(userId|organizerId|senderId|recipientId|actorId|subjectId|requesterId|reviewerId)$/.test(
              key,
            ) && typeof value === 'string',
        )
        .map(([, value]) => value);
      if (Array.isArray(data.completedParticipantIds))
        ids.push(...data.completedParticipantIds);
      const deleted = await client.query<{ userId: string }>(
        'SELECT "userId" FROM privacy_deleted_user WHERE "userId" = ANY($1::uuid[])',
        [ids],
      );
      const eventId =
        data.eventId ?? (event.producer === 'events' ? data.id : undefined);
      const removed =
        typeof eventId === 'string'
          ? await client.query(
              'SELECT 1 FROM privacy_deleted_event WHERE "eventId" = $1',
              [eventId],
            )
          : null;
      const hidden = new Set(deleted.rows.map((row) => row.userId));
      const erasedMail =
        event.eventType === EVENT_TYPES.notificationRequested
          ? await client.query(
              'SELECT 1 FROM privacy_deleted_mail WHERE id = $1',
              [event.eventId],
            )
          : null;
      const personal = Object.entries(data).some(
        ([key, value]) => key !== 'organizerId' && hidden.has(String(value)),
      );
      if (personal || removed?.rowCount || erasedMail?.rowCount) {
        // Preserve predecessor receipts so later events can still advance.
        await client.query(
          'INSERT INTO inbox_event (id, "eventType") VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [event.eventId, event.eventType],
        );
        return 'ignored';
      }
      const safe = {
        ...event,
        payload: {
          ...data,
          ...(hidden.has(String(data.organizerId))
            ? {
                organizerId: ANONYMOUS_USER_ID,
                ...(event.eventType === EVENT_TYPES.registrationPolicyRequested
                  ? { status: 'CLOSED' }
                  : {}),
              }
            : {}),
          ...(Array.isArray(data.completedParticipantIds)
            ? {
                completedParticipantIds: data.completedParticipantIds.filter(
                  (id) => id !== ANONYMOUS_USER_ID && !hidden.has(String(id)),
                ),
              }
            : {}),
        },
      };
      return await apply(safe);
    } finally {
      await client.query('SELECT pg_advisory_unlock_shared($1)', [
        PRIVACY_LOCK,
      ]);
      client.release();
    }
  }

  async recover(work: () => Promise<void>): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock_shared($1)', [PRIVACY_LOCK]);
      await work();
    } finally {
      await client.query('SELECT pg_advisory_unlock_shared($1)', [
        PRIVACY_LOCK,
      ]);
      client.release();
    }
  }
  async close(): Promise<void> {
    await this.pool.end();
  }
}
