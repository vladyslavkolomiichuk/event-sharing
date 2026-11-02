import { AppError } from '@event-sharing/common';

export class InvalidEventLogCursorError extends AppError {
  readonly code = 'INVALID_CURSOR';
  readonly statusCode = 400;

  constructor() {
    super('The event log cursor is invalid.');
  }
}
