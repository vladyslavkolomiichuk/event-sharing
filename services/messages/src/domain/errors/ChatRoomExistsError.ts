import { AppError } from '@event-sharing/common';

export class ChatRoomExistsError extends AppError {
  readonly code = 'CHAT_ROOM_EXISTS';
  readonly statusCode = 409;
  constructor() {
    super('A chat room with this name already exists for the event.');
  }
}
