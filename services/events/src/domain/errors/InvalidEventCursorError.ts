import { AppError } from '@event-sharing/common';

export class InvalidEventCursorError extends AppError {
  readonly code = 'INVALID_EVENT_CURSOR';
  readonly statusCode = 400;
  constructor() {
    super('The event list cursor is invalid for this request.');
  }
}
