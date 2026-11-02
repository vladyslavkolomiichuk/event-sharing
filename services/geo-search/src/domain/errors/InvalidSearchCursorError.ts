import { AppError } from '@event-sharing/common';

export class InvalidSearchCursorError extends AppError {
  readonly code = 'INVALID_SEARCH_CURSOR';
  readonly statusCode = 400;

  constructor() {
    super('The search cursor is invalid for this request.');
  }
}
