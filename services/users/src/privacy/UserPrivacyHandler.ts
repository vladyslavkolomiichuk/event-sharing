import type { PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';

export class UserPrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'profile',
      query: 'SELECT * FROM user_profile WHERE "userId" = $1 ORDER BY "userId"',
    },
    {
      name: 'preferences',
      query:
        'SELECT * FROM user_preference WHERE "userId" = $1 ORDER BY "userId"',
    },
    {
      name: 'friendRequests',
      query:
        'SELECT * FROM friend_request WHERE "senderId" = $1 OR "recipientId" = $1 ORDER BY id',
    },
    {
      name: 'friends',
      query:
        'SELECT * FROM friendship WHERE "userIdA" = $1 OR "userIdB" = $1 ORDER BY "userIdA", "userIdB"',
    },
    {
      name: 'blocks',
      query:
        'SELECT * FROM user_block WHERE "blockerId" = $1 ORDER BY "blockedId"',
    },
  ];
  protected async erase(tx: PoolClient, work: PrivacyWork) {
    await tx.query(
      'DELETE FROM friend_request WHERE "senderId" = $1 OR "recipientId" = $1',
      [work.userId],
    );
    await tx.query(
      'DELETE FROM friendship WHERE "userIdA" = $1 OR "userIdB" = $1',
      [work.userId],
    );
    await tx.query(
      'DELETE FROM user_block WHERE "blockerId" = $1 OR "blockedId" = $1',
      [work.userId],
    );
    await tx.query('DELETE FROM user_profile WHERE "userId" = $1', [
      work.userId,
    ]);
    return {};
  }
}
