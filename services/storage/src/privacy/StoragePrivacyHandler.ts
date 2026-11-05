import { unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { PrivacyWork } from '@event-sharing/contracts';
import { ServicePrivacyHandler } from '@event-sharing/messaging';
import type { PoolClient } from 'pg';
import { env } from '../config/env.js';

export class StoragePrivacyHandler extends ServicePrivacyHandler {
  protected readonly collections = [
    {
      name: 'files',
      query: 'SELECT * FROM stored_file WHERE "ownerId" = $1 ORDER BY id',
    },
  ];
  protected async erase(tx: PoolClient, work: PrivacyWork) {
    await tx.query('SELECT pg_advisory_xact_lock(194727201)');
    const files = await tx.query<{ id: string }>(
      'SELECT id FROM stored_file WHERE "ownerId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    for (const file of files.rows) {
      try {
        await unlink(join(resolve(env.STORAGE_PATH), file.id));
      } catch (error) {
        if (!(
          error instanceof Error &&
          'code' in error &&
          error.code === 'ENOENT'
        ))
          throw error;
      }
    }
    await tx.query(
      'DELETE FROM stored_file WHERE "ownerId" = $1 OR "eventId" = ANY($2::uuid[])',
      [work.userId, work.removedEventIds],
    );
    return {};
  }
}
