import { InternalJwtVerifier } from '@event-sharing/common';
import type { RpcRequest } from '@event-sharing/contracts';
import type { Pool } from 'pg';
import { ServiceRpcError } from './ServiceRpcError.js';

export class ServiceRequestAuthenticator {
  constructor(
    private readonly verifier: InternalJwtVerifier,
    private readonly pool: Pool,
  ) {}
  async user(request: RpcRequest) {
    const claims = await this.verifier.verify(request.authorization);
    if (!claims)
      throw new ServiceRpcError(
        'Authentication is required.',
        'UNAUTHORIZED',
        401,
      );
    const deleted = await this.pool.query(
      'SELECT 1 FROM privacy_deleted_user WHERE "userId" = $1',
      [claims.sub],
    );
    if (deleted.rowCount)
      throw new ServiceRpcError(
        'This account is no longer available.',
        'ACCOUNT_DELETED',
        410,
      );
    return { id: claims.sub, role: claims.role };
  }
}
