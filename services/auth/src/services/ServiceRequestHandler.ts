import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { ServiceRpcError } from '@event-sharing/messaging';
import { z } from 'zod';
import { privacyDatabase } from '../config/service-bus.js';
import { auth } from '../lib/auth.js';
import { AuthPrivacyHandler } from '../privacy/AuthPrivacyHandler.js';

export class ServiceRequestHandler {
  private readonly privacy = new AuthPrivacyHandler(privacyDatabase);

  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'Auth' };
    }
    if (request.operation === RPC_OPERATIONS.privacyExport)
      return this.privacy.handle(request);
    if (request.operation === RPC_OPERATIONS.signingKeys)
      return auth.api.getJwks();
    if (
      request.operation === RPC_OPERATIONS.session &&
      request.sender === 'gateway'
    ) {
      const { cookie } = z
        .object({ cookie: z.string().max(16384) })
        .parse(request.data);
      const { response, headers } = await auth.api.getSession({
        headers: new Headers({ cookie }),
        query: { disableCookieCache: true },
        returnHeaders: true,
      });
      if (!response) return null;
      const token = headers.get('set-auth-jwt');
      if (!token) throw new ServiceRpcError('Session token is unavailable.');
      return { session: response, token };
    }
    throw new ServiceRpcError('Unsupported Auth query.', 'FORBIDDEN', 403);
  };
}
