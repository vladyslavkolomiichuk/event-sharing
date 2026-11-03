import { AppError } from '@event-sharing/common';

export class RouteError extends AppError {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
