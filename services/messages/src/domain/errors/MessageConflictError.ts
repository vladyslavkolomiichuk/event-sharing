import { AppError } from '@event-sharing/common';

export class MessageConflictError extends AppError {
  readonly code = 'MESSAGE_CONFLICT';
  readonly statusCode = 409;

  constructor() {
    super('This message request ID was already used for different content.');
  }
}
