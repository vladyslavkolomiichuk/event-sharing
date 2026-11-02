import type { UserRole } from '@event-sharing/contracts';
import { AuthServiceUnavailableError } from '../domain/errors/AuthServiceUnavailableError.js';
import { AuthSessionSchema } from '../schemas/auth-session.schema.js';

export type GatewayIdentity = {
  token: string;
  user: {
    id: string;
    role: UserRole;
  };
};

export class AuthServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 3000,
  ) {}

  async getSessionIdentity(
    cookie: string | undefined,
  ): Promise<GatewayIdentity | null> {
    if (!cookie) {
      return null;
    }

    try {
      const response = await fetch(new URL('/auth/get-session', this.baseUrl), {
        headers: { cookie },
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        throw new AuthServiceUnavailableError();
      }

      const data: unknown = await response.json();
      if (data === null) {
        return null;
      }

      const session = AuthSessionSchema.parse(data);
      const token = response.headers.get('set-auth-jwt')?.trim();
      if (!token) {
        throw new AuthServiceUnavailableError();
      }

      return {
        token,
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
