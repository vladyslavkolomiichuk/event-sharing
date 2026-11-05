import {
  PRIVACY_COMMAND_AUDIENCE,
  PRIVACY_COMMANDS,
} from '@event-sharing/contracts';
import { env } from '../config/env.js';
import { auth } from '../lib/auth.js';

export class ChatDeletionClient {
  async anonymize(userId: string, requestId: string): Promise<void> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const { token } = await auth.api.signJWT({
      body: {
        payload: {
          sub: userId,
          jti: requestId,
          tokenUse: 'privacy-command',
          operation: PRIVACY_COMMANDS.anonymizeChat,
          aud: PRIVACY_COMMAND_AUDIENCE,
          iat: issuedAt,
          exp: issuedAt + 60,
        },
      },
    });
    const response = await fetch(
      `${env.MESSAGES_SERVICE_URL}/internal/privacy/anonymize-chat`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (response.status !== 204) throw new Error('Chat anonymization failed.');
  }
}
