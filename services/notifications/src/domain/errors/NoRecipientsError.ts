import { AppError } from '@event-sharing/common';

export class NoRecipientsError extends AppError {
  readonly code = 'NO_RECIPIENTS';
  readonly statusCode = 409;

  constructor() {
    super('This event has no active participants to message.');
  }
}
