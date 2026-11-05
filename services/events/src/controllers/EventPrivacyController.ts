import {
  PRIVACY_COMMAND_AUDIENCES,
  PRIVACY_COMMANDS,
} from '@event-sharing/contracts';
import { PrivacyCommandVerifier } from '@event-sharing/common';
import { createRemoteJWKSet } from 'jose';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { PrivacyDeletionReservationRepository } from '../repositories/PrivacyDeletionReservationRepository.js';

export class EventPrivacyController {
  constructor(
    private readonly verifier = new PrivacyCommandVerifier(
      createRemoteJWKSet(new URL(env.AUTH_JWKS_URL)),
      env.AUTH_JWT_ISSUER,
      PRIVACY_COMMAND_AUDIENCES.events,
      PRIVACY_COMMANDS.reserveEvents,
    ),
    private readonly reservations = new PrivacyDeletionReservationRepository(),
  ) {}

  reserve: RequestHandler = async (request, response) => {
    const command = await this.verifier.verify(request.get('authorization'));
    if (!command) throw new UnauthorizedError();
    await this.reservations.reserve(command.sub, command.jti);
    response.set('Cache-Control', 'no-store').status(204).end();
  };
}
