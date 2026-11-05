import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { z } from 'zod';
import { ServiceRpcError } from '@event-sharing/messaging';
import { privacyDatabase } from '../config/service-bus.js';
import { MessagePrivacyHandler } from '../privacy/MessagePrivacyHandler.js';

export class ServiceRequestHandler {
  constructor(
    private readonly changed: (
      users: string[],
      eventId: string,
    ) => void = () => {},
  ) {}
  private readonly privacy = new MessagePrivacyHandler(privacyDatabase);
  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'messages' };
    }
    if (request.operation.startsWith('privacy.')) {
      const reply = await this.privacy.handle(request);
      if (
        request.operation === RPC_OPERATIONS.privacyErase &&
        typeof reply === 'string'
      ) {
        const receipt = z
          .object({
            result: z.object({
              notifyMembers: z
                .array(z.object({ eventId: z.uuid(), userId: z.uuid() }))
                .default([]),
            }),
          })
          .parse(privacyDatabase.cipher.decode(reply));
        for (const member of receipt.result.notifyMembers)
          this.changed([member.userId], member.eventId);
      }
      return reply;
    }
    throw new ServiceRpcError('Unsupported query.', 'BAD_REQUEST', 400);
  };
}
