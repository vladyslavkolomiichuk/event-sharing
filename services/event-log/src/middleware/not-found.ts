import { ApiErrorSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';

export const notFound: RequestHandler = (_request, response) => {
  response.status(404).json(
    ApiErrorSchema.parse({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      details: [],
    }),
  );
};
