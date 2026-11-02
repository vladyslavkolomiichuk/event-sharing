import { AppError } from '@event-sharing/common';

export class EventConflictError extends AppError {
  readonly statusCode = 409;

  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
