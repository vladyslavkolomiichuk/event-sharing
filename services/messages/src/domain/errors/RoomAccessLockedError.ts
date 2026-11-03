import { AppError } from '@event-sharing/common';

export class RoomAccessLockedError extends AppError {
  readonly code = 'ROOM_ACCESS_LOCKED';
  readonly statusCode = 409;

  constructor() {
    super('Group access cannot change after messages have been sent.');
  }
}
