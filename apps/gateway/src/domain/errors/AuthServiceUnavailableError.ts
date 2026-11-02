import { AppError } from '@event-sharing/common';

export class AuthServiceUnavailableError extends AppError {
  readonly code = 'AUTH_SERVICE_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Authentication service is unavailable.');
  }
}
