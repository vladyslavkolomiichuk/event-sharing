import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { auth } from '../lib/auth.js';

export const requireUserSession: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const cookie = request.get('cookie');
  if (!cookie) throw new UnauthorizedError();
  const { response: session, headers } = await auth.api.getSession({
    headers: new Headers({ cookie }),
    query: { disableCookieCache: true },
    returnHeaders: true,
  });
  if (!session) throw new UnauthorizedError();
  const internalToken = headers.get('set-auth-jwt');
  request.authUser = {
    id: session.user.id,
    role: session.user.role ?? 'USER',
    ...(internalToken ? { internalToken } : {}),
  };
  next();
};
