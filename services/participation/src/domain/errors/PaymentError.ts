import { AppError } from '@event-sharing/common';

export class PaymentError extends AppError {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, code: string, statusCode = 409) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}
