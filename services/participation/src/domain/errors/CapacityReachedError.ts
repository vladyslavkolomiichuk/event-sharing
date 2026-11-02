import { AppError } from '@event-sharing/common';

export class CapacityReachedError extends AppError {
  readonly code = 'CAPACITY_REACHED';
  readonly statusCode = 409;

  constructor() {
    super('No places are available for this event.');
  }
}
