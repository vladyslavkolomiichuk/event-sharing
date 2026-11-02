import { UserRoleSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { auth } from '../lib/auth.js';

export const requireAdminSession: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const cookie = request.get('cookie');
  if (!cookie) {
    next(new UnauthorizedError());
    return;
  }

  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true },
  });

  if (!session) {
    next(new UnauthorizedError());
    return;
  }

  if (UserRoleSchema.parse(session.user.role) !== 'ADMIN') {
    next(new ForbiddenError());
    return;
  }

  request.authUser = {
    id: session.user.id,
    role: 'ADMIN',
  };
  next();
};
