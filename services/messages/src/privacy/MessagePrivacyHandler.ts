import { ANONYMOUS_USER_ID, type PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class MessagePrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'messages',
      query:
        'SELECT id, "eventId", "roomId", body, "createdAt" FROM chat_message WHERE "senderId" = $1 ORDER BY id',
    },
    {
      name: 'memberships',
      query:
        'SELECT * FROM chat_room_member WHERE "userId" = $1 ORDER BY "roomId"',
    },
    {
      name: 'readStates',
      query:
        'SELECT * FROM chat_read_state WHERE "userId" = $1 ORDER BY "roomId"',
    },
    {
      name: 'notificationPreferences',
      query:
        'SELECT * FROM chat_notification_preference WHERE "userId" = $1 ORDER BY "roomId"',
    },
  ];

  protected async erase(tx: PoolClient, work: PrivacyWork) {
    const recipients = await tx.query<{ eventId: string; userId: string }>(
      `SELECT DISTINCT member."eventId", member."userId" FROM membership_projection member WHERE member.active AND member."userId" <> $1 AND (member."eventId" IN (SELECT "eventId" FROM chat_message WHERE "senderId" = $1) OR member."eventId" IN (SELECT id FROM event_projection WHERE "organizerId" = $1))`,
      [work.userId],
    );
    await tx.query(
      "SELECT pg_advisory_xact_lock(hashtext('event-sharing-outbox'), hashtext('messages-membership'))",
    );
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [work.userId]);
    await tx.query(
      'INSERT INTO deleted_chat_user ("userId") VALUES ($1) ON CONFLICT DO NOTHING',
      [work.userId],
    );
    await tx.query(
      'UPDATE chat_message SET "senderId" = NULL, "clientMessageId" = NULL WHERE "senderId" = $1',
      [work.userId],
    );
    await tx.query(
      'UPDATE chat_room SET "createdBy" = $2 WHERE "createdBy" = $1',
      [work.userId, ANONYMOUS_USER_ID],
    );
    await tx.query(
      'UPDATE event_projection SET "organizerId" = $2 WHERE "organizerId" = $1',
      [work.userId, ANONYMOUS_USER_ID],
    );
    for (const table of [
      'chat_read_state',
      'chat_room_member',
      'chat_notification_preference',
    ])
      await tx.query(
        `DELETE FROM ${table} WHERE "userId" = $1 OR "roomId" IN (SELECT id FROM chat_room WHERE "eventId" = ANY($2::uuid[]))`,
        [work.userId, work.removedEventIds],
      );
    await tx.query(
      'DELETE FROM membership_projection WHERE "userId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    await tx.query('DELETE FROM user_projection WHERE id = $1', [work.userId]);
    await tx.query(
      'DELETE FROM chat_message WHERE "eventId" = ANY($1::uuid[])',
      [work.removedEventIds],
    );
    await tx.query('DELETE FROM chat_room WHERE "eventId" = ANY($1::uuid[])', [
      work.removedEventIds,
    ]);
    await tx.query('DELETE FROM event_projection WHERE id = ANY($1::uuid[])', [
      work.removedEventIds,
    ]);
    return { notifyMembers: recipients.rows };
  }
}
