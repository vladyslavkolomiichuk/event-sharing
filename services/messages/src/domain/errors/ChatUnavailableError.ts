import { AppError } from '@event-sharing/common';

export class ChatUnavailableError extends AppError {
  readonly code = 'CHAT_UNAVAILABLE';
  readonly statusCode = 409;
  constructor() {
    super('Chat is not available for this event.');
  }
}
