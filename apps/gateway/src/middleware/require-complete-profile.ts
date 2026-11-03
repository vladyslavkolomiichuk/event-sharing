import { AppError } from '@event-sharing/common';
import type { RequestHandler } from 'express';

class ProfileIncompleteError extends AppError {
  readonly code = 'PROFILE_INCOMPLETE';
  readonly statusCode = 403;

  constructor() {
    super('Choose a username to continue.');
  }
}

export const requireCompleteProfile: RequestHandler = (
  request,
  _response,
  next,
) => {
  if (!request.profileComplete) {
    next(new ProfileIncompleteError());
    return;
  }
  next();
};
