import { ApiErrorSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';

export const blockPublicAuthToken: RequestHandler = (
  request,
  response,
  next,
) => {
  if (request.path === '/auth/token') {
    response.status(404).json(
      ApiErrorSchema.parse({
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        details: [],
      }),
    );
    return;
  }

  next();
};
