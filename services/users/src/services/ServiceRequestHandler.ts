import {
  RPC_OPERATIONS,
  UsernameSchema,
  type RpcRequest,
} from '@event-sharing/contracts';
import { InternalJwtVerifier } from '@event-sharing/common';
import {
  ServiceRequestAuthenticator,
  ServiceRpcError,
} from '@event-sharing/messaging';
import { internalJwks } from '../config/internal-jwks.js';
import { z } from 'zod';
import { env } from '../config/env.js';
import { privacyDatabase } from '../config/service-bus.js';
import { UserPrivacyHandler } from '../privacy/UserPrivacyHandler.js';
import { UserProfileService } from './UserProfileService.js';
import { FriendService } from './FriendService.js';
import { UserProfileRepository } from '../repositories/UserProfileRepository.js';

export class ServiceRequestHandler {
  private readonly privacy = new UserPrivacyHandler(privacyDatabase);
  private readonly profiles = new UserProfileService(
    new UserProfileRepository(),
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
      return { status: 'ok', service: 'users' };
    }
    if (request.operation.startsWith('privacy.'))
      return this.privacy.handle(request);
    const user = await this.auth.user(request);
    if (request.operation === RPC_OPERATIONS.invitationTarget) {
      const { username } = z
        .object({ username: UsernameSchema })
        .parse(request.data);
      return new FriendService().invitationTarget(user.id, username);
    }
    const { userId } = z.object({ userId: z.uuid() }).parse(request.data);
    if (request.operation === RPC_OPERATIONS.profile)
      return this.profiles.getPublic(userId, user.id);
    if (request.operation === RPC_OPERATIONS.historyAccess)
      return { allowed: await this.profiles.canViewHistory(userId, user.id) };
    throw new ServiceRpcError('Unsupported profile query.', 'BAD_REQUEST', 400);
  };
}
