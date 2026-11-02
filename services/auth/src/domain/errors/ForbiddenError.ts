import { AppError } from '@event-sharing/common';

export class ForbiddenError extends AppError {
  readonly code = 'FORBIDDEN';
  readonly statusCode = 403;

  constructor() {
    super('You do not have permission to perform this action.');
  }
}
