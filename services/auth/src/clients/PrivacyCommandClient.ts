import type { PrivacyCommand } from '@event-sharing/contracts';
import { auth } from '../lib/auth.js';

export class PrivacyCommandClient {
  async send(input: {
    userId: string;
    requestId: string;
    audience: string;
    operation: PrivacyCommand['operation'];
    url: string;
  }): Promise<void> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const { token } = await auth.api.signJWT({
      body: {
        payload: {
          sub: input.userId,
          jti: input.requestId,
          tokenUse: 'privacy-command',
          operation: input.operation,
          aud: input.audience,
          iat: issuedAt,
          exp: issuedAt + 60,
        },
      },
    });
    const response = await fetch(input.url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30_000),
    });
    if (response.status !== 204)
      throw new Error(`Privacy command failed (${response.status}).`);
  }
}
