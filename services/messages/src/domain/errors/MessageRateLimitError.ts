import { AppError } from '@event-sharing/common';

export class MessageRateLimitError extends AppError {
  readonly code = 'MESSAGE_RATE_LIMITED';
  readonly statusCode = 429;
  constructor() {
    super('Wait before sending more chat messages.');
  }
}
