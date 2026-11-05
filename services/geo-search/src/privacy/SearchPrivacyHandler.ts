import { ANONYMOUS_USER_ID, type PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class SearchPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'preference',
      query:
        'SELECT * FROM search_preference WHERE "userId" = $1 ORDER BY "userId"',
    },
  ];
  protected async erase(tx: PoolClient, work: PrivacyWork) {
    await tx.query('DELETE FROM search_preference WHERE "userId" = $1', [
      work.userId,
    ]);
    await tx.query(
      'UPDATE event_projection SET "organizerId" = $2 WHERE "organizerId" = $1',
      [work.userId, ANONYMOUS_USER_ID],
    );
    await tx.query('DELETE FROM event_projection WHERE id = ANY($1::uuid[])', [
      work.removedEventIds,
    ]);
    return {};
  }
}
