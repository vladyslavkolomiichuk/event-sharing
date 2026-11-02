import { AppError } from '@event-sharing/common';

export class ResourceNotFoundError extends AppError {
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('The requested item was not found.');
  }
}
