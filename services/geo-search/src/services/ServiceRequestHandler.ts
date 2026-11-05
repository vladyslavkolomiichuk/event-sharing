import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { ServiceRpcError } from '@event-sharing/messaging';
import { privacyDatabase } from '../config/service-bus.js';
import { SearchPrivacyHandler } from '../privacy/SearchPrivacyHandler.js';

export class ServiceRequestHandler {
  private readonly privacy = new SearchPrivacyHandler(privacyDatabase);
  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'geo-search' };
    }
    if (request.operation.startsWith('privacy.'))
      return this.privacy.handle(request);
    throw new ServiceRpcError('Unsupported query.', 'BAD_REQUEST', 400);
  };
}
