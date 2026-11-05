import { privacyRequestGuard } from '@event-sharing/messaging';
import { privacyDatabase } from '../config/service-bus.js';
import { InternalJwtVerifier } from '@event-sharing/common';
import { internalJwks } from '../config/internal-jwks.js';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

const verifier = new InternalJwtVerifier({
  jwks: internalJwks,
  issuer: env.AUTH_JWT_ISSUER,
  audience: env.AUTH_JWT_AUDIENCE,
});

export const requireInternalJwt: RequestHandler = async (
  request,
  response,
  next,
) => {
  const claims = await verifier.verify(request.get('authorization'));
  if (!claims) return next(new UnauthorizedError());
  request.authenticatedUser = { id: claims.sub };
  await privacyRequestGuard(privacyDatabase.pool)(claims.sub, response, next);
};
