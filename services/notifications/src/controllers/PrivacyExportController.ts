import type { RequestHandler } from 'express';
import { prisma } from '../database/client.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

export class PrivacyExportController {
  export: RequestHandler = async (request, response) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new UnauthorizedError();
    const [notifications, sentAnnouncements] = await Promise.all([
      prisma.inAppNotification.findMany({ where: { recipientId: userId } }),
      prisma.inAppMessage.findMany({ where: { senderId: userId } }),
    ]);
    response
      .set('cache-control', 'no-store')
      .json({ notifications, sentAnnouncements });
  };
}
