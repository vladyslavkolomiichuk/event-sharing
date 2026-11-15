import { AppError } from '@event-sharing/common';
import {
  CITY_CHANGE_LIMIT,
  CITY_CHANGE_WINDOW_DAYS,
} from '@event-sharing/contracts';

export class CityChangeLimitError extends AppError {
  readonly code = 'CITY_CHANGE_LIMIT';
  readonly statusCode = 429;

  constructor(readonly retryAt: Date) {
    const date = retryAt.toISOString().slice(0, 10);
    super(
      `You can change your city ${CITY_CHANGE_LIMIT} times in ${CITY_CHANGE_WINDOW_DAYS} days. Try again after ${date}.`,
      [{ path: 'city', message: `Next change is possible after ${date}.` }],
    );
  }
}
