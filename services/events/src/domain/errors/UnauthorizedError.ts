import { AppError } from '@event-sharing/common';

export class UnauthorizedError extends AppError {
  readonly code = 'UNAUTHORIZED';
  readonly statusCode = 401;

  constructor() {
    super('A valid internal access token is required.');
  }
}
