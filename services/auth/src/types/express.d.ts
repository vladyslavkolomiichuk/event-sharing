import type { UserRole } from '@event-sharing/contracts';

declare global {
  namespace Express {
    interface Request {
      authUser?: {
        id: string;
        role: UserRole;
        internalToken?: string;
      };
    }
  }
}

export {};
