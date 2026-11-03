import type { RequestHandler } from 'express';
import { prisma } from '../database/client.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';

export class PrivacyExportController {
  export: RequestHandler = async (request, response) => {
    const userId = request.authenticatedUser?.id;
    if (!userId) throw new UnauthorizedError();
    const [sentMessages, roomMemberships, readStates] = await Promise.all([
      prisma.chatMessage.findMany({ where: { senderId: userId } }),
      prisma.chatRoomMember.findMany({ where: { userId } }),
      prisma.chatReadState.findMany({ where: { userId } }),
    ]);
    response
      .set('cache-control', 'no-store')
      .json({ sentMessages, roomMemberships, readStates });
  };
}
