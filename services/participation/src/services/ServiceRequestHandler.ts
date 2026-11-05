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
import { ParticipationPrivacyHandler } from '../privacy/ParticipationPrivacyHandler.js';
import { ParticipationRepository } from '../repositories/ParticipationRepository.js';
import { RegistrationPolicyRepository } from '../repositories/RegistrationPolicyRepository.js';
import { ParticipationService } from './ParticipationService.js';

export class ServiceRequestHandler {
  private readonly privacy = new ParticipationPrivacyHandler(privacyDatabase);
  private readonly participation = new ParticipationService(
    new RegistrationPolicyRepository(),
    new ParticipationRepository(),
  );
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
      return { status: 'ok', service: 'participation' };
    }
    if (request.operation.startsWith('privacy.'))
      return this.privacy.handle(request);
    const user = await this.auth.user(request);
    if (request.operation === RPC_OPERATIONS.membership) {
      const { eventId, userId } = z
        .object({ eventId: z.uuid(), userId: z.uuid() })
        .parse(request.data);
      return this.participation.memberStatus(
        eventId,
        userId,
        user.id,
        user.role,
      );
    }
    throw new ServiceRpcError(
      'Unsupported participation query.',
      'BAD_REQUEST',
      400,
    );
  };
}
