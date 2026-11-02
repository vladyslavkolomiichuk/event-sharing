import { InternalJwtVerifier } from '@event-sharing/common';
import { AuthenticatedUserRealtimeServer } from '@event-sharing/messaging';
import { env } from '../config/env.js';
import { internalJwks } from '../config/internal-jwks.js';

export class NotificationRealtimeServer extends AuthenticatedUserRealtimeServer {
  constructor() {
    super(
      new InternalJwtVerifier({
        jwks: internalJwks,
        issuer: env.AUTH_JWT_ISSUER,
        audience: env.AUTH_JWT_AUDIENCE,
      }),
    );
  }
}
