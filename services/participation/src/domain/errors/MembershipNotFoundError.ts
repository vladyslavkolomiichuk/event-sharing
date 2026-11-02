import { AppError } from '@event-sharing/common';

export class MembershipNotFoundError extends AppError {
  readonly code = 'MEMBERSHIP_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('You have not joined this event.');
  }
}
