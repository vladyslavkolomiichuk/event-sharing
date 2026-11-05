import { RPC_OPERATIONS, type UserRole } from '@event-sharing/contracts';
import { z } from 'zod';
import { serviceBus } from '../config/service-bus.js';
import { AuthServiceUnavailableError } from '../domain/errors/AuthServiceUnavailableError.js';
import { AuthSessionSchema } from '../schemas/auth-session.schema.js';

export type GatewayIdentity = {
  token: string;
  username: string | null;
  user: {
    id: string;
    role: UserRole;
  };
};

export class AuthServiceClient {
  async getSessionIdentity(
    cookie: string | undefined,
  ): Promise<GatewayIdentity | null> {
    if (!cookie) {
      return null;
    }

    try {
      const data = await serviceBus.call(
        'auth',
        RPC_OPERATIONS.session,
        { cookie },
        undefined,
        5000,
      );
      if (data === null) {
        return null;
      }

      const { session, token } = z
        .object({ session: AuthSessionSchema, token: z.string().min(1) })
        .parse(data);

      return {
        token,
        username: session.user.username,
        user: {
          id: session.user.id,
          role: session.user.role,
        },
      };
    } catch {
      throw new AuthServiceUnavailableError();
    }
  }
}
