import { RPC_OPERATIONS, type RpcRequest } from '@event-sharing/contracts';
import { InternalJwtVerifier } from '@event-sharing/common';
import {
  ServiceRequestAuthenticator,
  ServiceRpcError,
} from '@event-sharing/messaging';
import { internalJwks } from '../config/internal-jwks.js';
import { z } from 'zod';
import { env } from '../config/env.js';
import { privacyDatabase } from '../config/service-bus.js';
import { EventPrivacyHandler } from '../privacy/EventPrivacyHandler.js';
import { PublicEventRepository } from '../repositories/PublicEventRepository.js';
import { EventService } from './EventService.js';

export class ServiceRequestHandler {
  private readonly privacy = new EventPrivacyHandler(privacyDatabase);
  private readonly events = new EventService();
  private readonly auth = new ServiceRequestAuthenticator(
    new InternalJwtVerifier({
      jwks: internalJwks,
      issuer: env.AUTH_JWT_ISSUER,
      audience: env.AUTH_JWT_AUDIENCE,
    }),
    privacyDatabase.pool,
  );

  handle = async (request: RpcRequest): Promise<unknown> => {
    if (request.operation === RPC_OPERATIONS.readiness) {
      await privacyDatabase.pool.query('SELECT 1');
      return { status: 'ok', service: 'events' };
    }
    if (request.operation.startsWith('privacy.'))
      return this.privacy.handle(request);
    if (request.operation === RPC_OPERATIONS.publicEvent) {
      const { eventId } = z.object({ eventId: z.uuid() }).parse(request.data);
      return { visible: await new PublicEventRepository().isVisible(eventId) };
    }
    const user = await this.auth.user(request);
    if (request.operation === RPC_OPERATIONS.activeEvents)
      return { hasActiveEvents: await this.events.hasActiveEvents(user.id) };
    if (request.operation === RPC_OPERATIONS.eventDetail) {
      const { eventId } = z.object({ eventId: z.uuid() }).parse(request.data);
      return this.events.get(eventId, user.id, user.role);
    }
    throw new ServiceRpcError('Unsupported event query.', 'BAD_REQUEST', 400);
  };
}
