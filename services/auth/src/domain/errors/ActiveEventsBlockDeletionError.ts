import { AppError } from '@event-sharing/common';

export class ActiveEventsBlockDeletionError extends AppError {
  readonly code = 'ACTIVE_EVENTS_BLOCK_DELETION';
  readonly statusCode = 409;

  constructor() {
    super('Cancel your active events before requesting account deletion.');
  }
}
