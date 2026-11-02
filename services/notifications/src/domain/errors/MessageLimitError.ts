import { AppError } from '@event-sharing/common';

export class MessageLimitError extends AppError {
  readonly code = 'MESSAGE_LIMIT_REACHED';
  readonly statusCode = 429;

  constructor() {
    super('The daily message limit has been reached.');
  }
}
