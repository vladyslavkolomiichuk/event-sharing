import type { UserRole } from '@event-sharing/contracts';

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      internalUserJwt?: string;
      profileComplete?: boolean;
      authenticatedUser?: {
        id: string;
        role: UserRole;
      };
    }
  }
}

export {};
