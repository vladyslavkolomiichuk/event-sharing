import type { UserRole } from '@event-sharing/contracts';

declare global {
  namespace Express {
    interface Request {
      authenticatedUser?: { id: string; role: UserRole };
    }
  }
}

export {};
