import { AppError } from '@event-sharing/common';

export class EventNotFoundError extends AppError {
  readonly code = 'EVENT_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('The event was not found.');
  }
}
