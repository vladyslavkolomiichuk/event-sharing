import { AppError } from '@event-sharing/common';

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;

  constructor() {
    super('Administrator access is required.');
  }
}
