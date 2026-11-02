import { InternalJwtVerifier } from '@event-sharing/common';
import { createRemoteJWKSet } from 'jose';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

const verifier = new InternalJwtVerifier({
  jwks: createRemoteJWKSet(new URL(env.AUTH_JWKS_URL)),
  issuer: env.AUTH_JWT_ISSUER,
  audience: env.AUTH_JWT_AUDIENCE,
});

export const requireAdminJwt: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const claims = await verifier.verify(request.get('authorization'));
  if (!claims) return next(new UnauthorizedError());
  if (claims.role !== 'ADMIN') return next(new ForbiddenError());
  next();
};
