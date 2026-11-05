import { ANONYMOUS_USER_ID, type PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

export class NotificationPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'notifications',
      query:
        'SELECT * FROM in_app_notification WHERE "recipientId" = $1 ORDER BY id',
    },
    {
      name: 'announcements',
      query: 'SELECT * FROM in_app_message WHERE "senderId" = $1 ORDER BY id',
    },
  ];
  protected async erase(tx: PoolClient, work: PrivacyWork) {
    const members = await tx.query<{
      eventId: string;
      userId: string;
      title: string;
    }>(
      `SELECT member."eventId", member."userId", event.title FROM membership_projection member JOIN event_projection event ON event.id = member."eventId" WHERE event."organizerId" = $1 AND member.active AND member."userId" <> $1 AND NOT (event.id = ANY($2::uuid[])) AND NOT EXISTS (SELECT 1 FROM privacy_deleted_user WHERE "userId" = member."userId")`,
      [work.userId, work.removedEventIds],
    );
    for (const member of members.rows) {
      // A distinct source per event preserves one notification for each history item.
      await tx.query(
        `INSERT INTO in_app_notification (id, "recipientId", type, title, body, href, "eventId", "sourceEventId") VALUES ($1, $2, 'EVENT_ORGANIZER_DELETED', 'Organizer account deleted', $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
        [
          randomUUID(),
          member.userId,
          `${member.title} remains in your history. You can hide it from your profile without affecting other participants.`,
          `/events/${member.eventId}`,
          member.eventId,
          randomUUID(),
        ],
      );
    }
    await tx.query(
      'DELETE FROM in_app_notification WHERE "recipientId" = $1 OR "senderId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    await tx.query(
      'DELETE FROM in_app_message WHERE "senderId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    await tx.query(
      'DELETE FROM pending_organizer_request WHERE "requesterId" = $1',
      [work.userId],
    );
    await tx.query(
      'DELETE FROM membership_projection WHERE "userId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    await tx.query('DELETE FROM user_projection WHERE id = $1', [work.userId]);
    await tx.query(
      'UPDATE event_projection SET "organizerId" = $2 WHERE "organizerId" = $1',
      [work.userId, ANONYMOUS_USER_ID],
    );
    await tx.query('DELETE FROM event_projection WHERE id = ANY($1::uuid[])', [
      work.removedEventIds,
    ]);
    await tx.query('DELETE FROM email_delivery WHERE id = ANY($1::uuid[])', [
      work.mailRequestIds,
    ]);
    return {
      notifyUserIds: [...new Set(members.rows.map((member) => member.userId))],
    };
  }
}
