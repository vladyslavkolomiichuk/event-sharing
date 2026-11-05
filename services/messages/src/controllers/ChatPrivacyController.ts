import { PRIVACY_COMMAND_AUDIENCE } from '@event-sharing/contracts';
import { PrivacyCommandVerifier } from '@event-sharing/common';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { internalJwks } from '../config/internal-jwks.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { ChatPrivacyRepository } from '../repositories/ChatPrivacyRepository.js';

export class ChatPrivacyController {
  constructor(
    private readonly verifier = new PrivacyCommandVerifier(
      internalJwks,
      env.AUTH_JWT_ISSUER,
      PRIVACY_COMMAND_AUDIENCE,
    ),
    private readonly privacy = new ChatPrivacyRepository(),
  ) {}

  anonymize: RequestHandler = async (request, response) => {
    const command = await this.verifier.verify(request.get('authorization'));
    if (!command) throw new UnauthorizedError();
    await this.privacy.anonymizeUser(command.sub);
    response.set('Cache-Control', 'no-store').status(204).end();
  };
}
