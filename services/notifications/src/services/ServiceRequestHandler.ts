import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { z } from 'zod';
import { ServiceRpcError } from '@event-sharing/messaging';
import { privacyDatabase } from '../config/service-bus.js';
import { NotificationPrivacyHandler } from '../privacy/NotificationPrivacyHandler.js';

export class ServiceRequestHandler {
  constructor(private readonly changed: (users: string[]) => void = () => {}) {}
  private readonly privacy = new NotificationPrivacyHandler(privacyDatabase);
  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'notifications' };
    }
    if (request.operation.startsWith('privacy.')) {
      const reply = await this.privacy.handle(request);
      if (
        request.operation === RPC_OPERATIONS.privacyErase &&
        typeof reply === 'string'
      ) {
        const receipt = z
          .object({
            result: z.object({ notifyUserIds: z.array(z.uuid()).default([]) }),
          })
          .parse(privacyDatabase.cipher.decode(reply));
        this.changed(receipt.result.notifyUserIds);
      }
      return reply;
    }
    throw new ServiceRpcError('Unsupported query.', 'BAD_REQUEST', 400);
  };
}
