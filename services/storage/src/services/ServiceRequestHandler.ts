import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { ServiceRpcError } from '@event-sharing/messaging';
import { privacyDatabase } from '../config/service-bus.js';
import { StoragePrivacyHandler } from '../privacy/StoragePrivacyHandler.js';

export class ServiceRequestHandler {
  private readonly privacy = new StoragePrivacyHandler(privacyDatabase);
  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'storage' };
    }
    if (request.operation.startsWith('privacy.'))
      return this.privacy.handle(request);
    throw new ServiceRpcError('Unsupported query.', 'BAD_REQUEST', 400);
  };
}
