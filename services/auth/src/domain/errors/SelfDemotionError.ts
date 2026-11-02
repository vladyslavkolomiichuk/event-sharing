import { AppError } from '@event-sharing/common';

export class SelfDemotionError extends AppError {
  readonly code = 'SELF_DEMOTION_NOT_ALLOWED';
  readonly statusCode = 409;

  constructor() {
    super('An administrator cannot remove their own administrator role.');
  }
}
