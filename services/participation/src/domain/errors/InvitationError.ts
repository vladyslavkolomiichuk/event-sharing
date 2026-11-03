import { AppError } from '@event-sharing/common';

export class InvitationError extends AppError {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code = 'INVITATION_INVALID', statusCode = 409) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
