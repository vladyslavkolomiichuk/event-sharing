import { ANONYMOUS_USER_ID, type PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class ParticipationPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'memberships',
      query: 'SELECT * FROM membership WHERE "userId" = $1 ORDER BY "eventId"',
    },
    {
      name: 'invitations',
      query:
        'SELECT * FROM personal_invite WHERE "recipientId" = $1 OR "senderId" = $1 ORDER BY id',
    },
  ];

  protected async erase(tx: PoolClient, work: PrivacyWork) {
    const owned = await tx.query<{ eventId: string }>(
      'SELECT "eventId" FROM registration_policy WHERE "organizerId" = $1 ORDER BY "eventId"',
      [work.userId],
    );
    const eventIds = [
      ...new Set([...work.eventIds, ...owned.rows.map((row) => row.eventId)]),
    ].sort();
    const memberships = await tx.query<{ eventId: string }>(
      'SELECT "eventId" FROM membership WHERE "userId" = $1',
      [work.userId],
    );
    const locked = [
      ...new Set([...eventIds, ...memberships.rows.map((row) => row.eventId)]),
    ].sort();
    for (const id of locked) {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [id]);
      await tx.query(
        'SELECT "eventId" FROM registration_policy WHERE "eventId" = $1 FOR UPDATE',
        [id],
      );
    }
    await tx.query(
      `UPDATE registration_policy policy SET occupied = GREATEST(0, occupied - 1) FROM membership member WHERE member."userId" = $1 AND member.status = 'JOINED' AND policy."eventId" = member."eventId"`,
      [work.userId],
    );
    await tx.query('DELETE FROM membership WHERE "userId" = $1', [work.userId]);
    await tx.query('DELETE FROM personal_invite WHERE "recipientId" = $1', [
      work.userId,
    ]);
    const retained = await tx.query<{ eventId: string }>(
      `SELECT DISTINCT "eventId" FROM membership WHERE "eventId" = ANY($1::uuid[]) AND status IN ('JOINED', 'CANCELLED') UNION SELECT "eventId" FROM personal_invite WHERE "eventId" = ANY($1::uuid[]) AND status IN ('PENDING', 'ACCEPTED')`,
      [eventIds],
    );
    const keep = new Set(retained.rows.map((row) => row.eventId));
    const removedEventIds = eventIds.filter((id) => !keep.has(id));
    await tx.query(
      'DELETE FROM invite_link WHERE "createdBy" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, removedEventIds],
    );
    await tx.query(
      'DELETE FROM personal_invite WHERE "eventId" = ANY($1::uuid[])',
      [removedEventIds],
    );
    await tx.query(
      'UPDATE personal_invite SET "senderId" = $2 WHERE "senderId" = $1',
      [work.userId, ANONYMOUS_USER_ID],
    );
    await tx.query(
      `UPDATE registration_policy SET "organizerId" = $2, status = CASE WHEN status = 'CANCELLED' THEN 'CANCELLED'::"RegistrationStatus" ELSE 'CLOSED'::"RegistrationStatus" END WHERE "organizerId" = $1`,
      [work.userId, ANONYMOUS_USER_ID],
    );
    await tx.query('DELETE FROM membership WHERE "eventId" = ANY($1::uuid[])', [
      removedEventIds,
    ]);
    await tx.query(
      'DELETE FROM registration_policy WHERE "eventId" = ANY($1::uuid[])',
      [removedEventIds],
    );
    await tx.query(
      `DELETE FROM pending_policy_event WHERE "aggregateId" = ANY($1::uuid[])`,
      [removedEventIds],
    );
    await tx.query(
      `UPDATE pending_policy_event SET payload = jsonb_set(jsonb_set(payload, '{organizerId}', to_jsonb($2::text)), '{status}', '"CLOSED"') WHERE payload ->> 'organizerId' = $1`,
      [work.userId, ANONYMOUS_USER_ID],
    );
    for (const eventId of removedEventIds)
      await tx.query(
        'INSERT INTO privacy_deleted_event ("eventId") VALUES ($1) ON CONFLICT DO NOTHING',
        [eventId],
      );
    return { eventIds, removedEventIds };
  }
}
