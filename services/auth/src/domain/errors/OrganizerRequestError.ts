import { AppError } from '@event-sharing/common';

export class OrganizerRequestError extends AppError {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
