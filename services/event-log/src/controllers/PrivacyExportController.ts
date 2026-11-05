import { InternalJwtVerifier } from '@event-sharing/common';
import { internalJwks } from '../config/internal-jwks.js';
import type { RequestHandler } from 'express';
import { env } from '../config/env.js';
import { prisma } from '../database/client.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

const verifier = new InternalJwtVerifier({
  jwks: internalJwks,
  issuer: env.AUTH_JWT_ISSUER,
  audience: env.AUTH_JWT_AUDIENCE,
});

export class PrivacyExportController {
  export: RequestHandler = async (request, response) => {
    const claims = await verifier.verify(request.get('authorization'));
    if (!claims) throw new UnauthorizedError();
    const entries = await prisma.eventLogEntry.findMany({
      where: {
        OR: [{ actorId: claims.sub }, { subjectUserId: claims.sub }],
      },
      orderBy: { occurredAt: 'desc' },
    });
    response.set('cache-control', 'no-store').json({
      entries: entries.map((entry) => ({
        ...entry,
        offset: entry.offset.toString(),
      })),
    });
  };
}
