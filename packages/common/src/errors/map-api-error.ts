import { ApiErrorSchema, type ApiError } from '@event-sharing/contracts';
import { ZodError } from 'zod';
import { AppError } from './AppError.js';

export type MappedApiError = {
  statusCode: number;
  body: ApiError;
  unexpected: boolean;
};

export function mapApiError(error: unknown): MappedApiError {
  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    return {
      statusCode: 400,
      body: ApiErrorSchema.parse({
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.',
        details: [],
      }),
      unexpected: false,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      body: ApiErrorSchema.parse({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      }),
      unexpected: false,
    };
  }

  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: ApiErrorSchema.parse({
        code: error.code,
        message: error.message,
        details: error.details,
      }),
      unexpected: false,
    };
  }

  return {
    statusCode: 500,
    body: ApiErrorSchema.parse({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      details: [],
    }),
    unexpected: true,
  };
}
