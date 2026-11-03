import type { RequestHandler } from 'express';
import type { AuthServiceClient } from '../clients/AuthServiceClient.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { needsUsernameSelection } from '@event-sharing/contracts';

export function createAuthenticateBrowserSession(
  client: AuthServiceClient,
): RequestHandler {
  return async (request, _response, next) => {
    const identity = await client.getSessionIdentity(request.get('cookie'));
    if (!identity) {
      next(new UnauthorizedError());
      return;
    }

    request.internalUserJwt = identity.token;
    request.authenticatedUser = identity.user;
    request.profileComplete = !needsUsernameSelection(identity.username);
    next();
  };
}
