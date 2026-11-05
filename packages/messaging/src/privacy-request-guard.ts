import type { ServerResponse } from 'node:http';
import type { Pool } from 'pg';
import { ServiceRpcError } from './ServiceRpcError.js';

export function privacyRequestGuard(pool: Pool) {
  return async (
    userId: string,
    _response: ServerResponse,
    next: (error?: Error) => void,
  ): Promise<void> => {
    const deleted = await pool.query(
      'SELECT 1 FROM privacy_deleted_user WHERE "userId" = $1',
      [userId],
    );
    if (deleted.rowCount)
      throw new ServiceRpcError(
        'This account is no longer available.',
        'ACCOUNT_DELETED',
        410,
      );
    // Database triggers also reject writes that race with deletion.
    next();
  };
}
