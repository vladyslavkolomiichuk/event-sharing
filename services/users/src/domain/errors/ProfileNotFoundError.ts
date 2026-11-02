import { AppError } from '@event-sharing/common';

export class ProfileNotFoundError extends AppError {
  readonly code = 'PROFILE_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('User profile was not found.');
  }
}
