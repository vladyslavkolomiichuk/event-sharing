import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';

const trustedOrigins = new Set([
  new URL(env.FRONTEND_ORIGIN).origin,
  new URL(env.BETTER_AUTH_URL).origin,
]);

export const requireTrustedOrigin: RequestHandler = (
  request,
  _response,
  next,
) => {
  const origin = request.get('origin');
  if (origin && !trustedOrigins.has(origin)) {
    next(new ForbiddenError());
    return;
  }

  next();
};
