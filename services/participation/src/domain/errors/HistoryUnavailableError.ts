import { AppError } from '@event-sharing/common';

export class HistoryUnavailableError extends AppError {
  readonly code = 'HISTORY_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Participation history is temporarily unavailable.');
  }
}
