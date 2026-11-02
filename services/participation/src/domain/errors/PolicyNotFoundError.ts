import { AppError } from '@event-sharing/common';

export class PolicyNotFoundError extends AppError {
  readonly code = 'REGISTRATION_POLICY_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('Registration is not available for this event.');
  }
}
