import type { PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class EventLogPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'activity',
      query:
        'SELECT id, "eventType", "occurredAt", "relatedEventId", summary, details FROM event_log_entry WHERE "actorId" = $1 OR "subjectUserId" = $1 ORDER BY id',
    },
  ];
  protected async erase(tx: PoolClient, work: PrivacyWork) {
    await tx.query(
      `DELETE FROM event_log_entry WHERE "actorId" = $1 OR "subjectUserId" = $1 OR details::text LIKE '%' || $1 || '%' OR "relatedEventId" = ANY($2::uuid[])`,
      [work.userId, work.removedEventIds],
    );
    return {};
  }
}
