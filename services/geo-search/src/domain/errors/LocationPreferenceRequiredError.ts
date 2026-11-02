import { AppError } from '@event-sharing/common';

export class LocationPreferenceRequiredError extends AppError {
  readonly code = 'LOCATION_PREFERENCE_REQUIRED';
  readonly statusCode = 403;

  constructor() {
    super('Choose this search location method first.');
  }
}
