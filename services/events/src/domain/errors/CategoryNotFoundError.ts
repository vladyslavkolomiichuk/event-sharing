import { AppError } from '@event-sharing/common';

export class CategoryNotFoundError extends AppError {
  readonly code = 'CATEGORY_NOT_FOUND';
  readonly statusCode = 404;

  constructor() {
    super('The category was not found.');
  }
}
