import { AppError } from '@event-sharing/common';

export class DeletionCheckUnavailableError extends AppError {
  readonly code = 'DELETION_CHECK_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Event status could not be checked. Please try again later.');
  }
}
