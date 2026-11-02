import { AppError } from '@event-sharing/common';

export class RegistrationClosedError extends AppError {
  readonly code = 'REGISTRATION_CLOSED';
  readonly statusCode = 409;

  constructor() {
    super('Registration is closed for this event.');
  }
}
