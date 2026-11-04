import { AppError } from '@event-sharing/common';

export class StorageError extends AppError {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}
