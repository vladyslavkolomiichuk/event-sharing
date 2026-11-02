import type { ApiErrorDetail } from '@event-sharing/contracts';

export abstract class AppError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  protected constructor(
    message: string,
    readonly details: ApiErrorDetail[] = [],
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}
