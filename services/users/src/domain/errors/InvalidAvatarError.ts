import { AppError } from '@event-sharing/common';

export class InvalidAvatarError extends AppError {
  readonly code = 'INVALID_AVATAR';
  readonly statusCode = 400;

  constructor() {
    super('The profile avatar path is invalid.');
  }
}
