import { mapApiError } from '@event-sharing/common';
import type { ErrorRequestHandler } from 'express';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  _next,
) => {
  const mapped = mapApiError(error);
  if (mapped.unexpected) {
    console.error(
      'Messages request failed.',
      error instanceof Error ? error.name : 'UnknownError',
    );
  }
  response.status(mapped.statusCode).json(mapped.body);
};
