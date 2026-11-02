import { AppError } from '@event-sharing/common';

export class UsernameTakenError extends AppError {
  readonly code = 'USERNAME_TAKEN';
  readonly statusCode = 409;

  constructor() {
    super('This username is already in use.');
  }
}
