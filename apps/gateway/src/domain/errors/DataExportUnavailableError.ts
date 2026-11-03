import { AppError } from '@event-sharing/common';

export class DataExportUnavailableError extends AppError {
  readonly code = 'DATA_EXPORT_UNAVAILABLE';
  readonly statusCode = 503;

  constructor() {
    super('Your data export is temporarily unavailable. Please try again.');
  }
}
