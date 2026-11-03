import type { RequestHandler } from 'express';
import { prisma } from '../database/client.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

export class PrivacyExportController {
  export: RequestHandler = async (request, response) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new UnauthorizedError();
    const [memberships, invitations, inviteLinks] = await Promise.all([
      prisma.membership.findMany({ where: { userId } }),
      prisma.personalInvite.findMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      }),
      prisma.inviteLink.findMany({
        where: { createdBy: userId },
        select: {
          id: true,
          eventId: true,
          createdAt: true,
          expiresAt: true,
          maxUses: true,
          uses: true,
          revokedAt: true,
        },
      }),
    ]);
    response
      .set('cache-control', 'no-store')
      .json({ memberships, invitations, inviteLinks });
  };
}
