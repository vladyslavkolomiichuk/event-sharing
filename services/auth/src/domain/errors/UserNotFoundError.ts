import { AppError } from '@event-sharing/common';

export class UserNotFoundError extends AppError {
  readonly code = 'USER_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('User not found.');
  }
}
