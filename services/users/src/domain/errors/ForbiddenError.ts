import { AppError } from '@event-sharing/common';

export class ForbiddenError extends AppError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';

  constructor() {
    super('You do not have permission to perform this action.');
  }
}
