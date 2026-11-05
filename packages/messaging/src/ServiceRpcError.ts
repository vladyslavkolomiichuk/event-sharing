import { AppError } from '@event-sharing/common';

export class ServiceRpcError extends AppError {
  constructor(
    message: string,
    readonly code = 'SERVICE_UNAVAILABLE',
    readonly statusCode = 503,
  ) {
    super(message);
  }
}
