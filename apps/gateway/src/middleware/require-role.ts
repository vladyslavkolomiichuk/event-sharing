import type { UserRole } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (request, _response, next) => {
    const user = request.authenticatedUser;
    if (!user) {
      next(new UnauthorizedError());
      return;
    }

    if (!roles.includes(user.role)) {
      next(new ForbiddenError());
      return;
    }

    next();
  };
}
