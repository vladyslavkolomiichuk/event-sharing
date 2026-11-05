import { prisma } from '../database/client.js';

export class ChatPrivacyRepository {
  async anonymizeUser(userId: string): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext('event-sharing-outbox'), hashtext('messages-membership'))`;
      await transaction.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${userId}))`;
      await transaction.deletedChatUser.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      await transaction.chatMessage.updateMany({
        where: { senderId: userId },
        data: { senderId: null, clientMessageId: null },
      });
      await transaction.chatReadState.deleteMany({ where: { userId } });
      await transaction.chatRoomMember.deleteMany({ where: { userId } });
      await transaction.membershipProjection.deleteMany({ where: { userId } });
      await transaction.userProjection.deleteMany({ where: { id: userId } });
      await transaction.$executeRaw`
        DELETE FROM pending_membership_event
        WHERE envelope::jsonb -> 'payload' ->> 'userId' = ${userId}
      `;
      await transaction.$executeRaw`
        DELETE FROM outbox_event
        WHERE payload ->> 'senderId' = ${userId}
          OR payload ->> 'recipientId' = ${userId}
          OR payload ->> 'actorId' = ${userId}
          OR payload ->> 'subjectId' = ${userId}
      `;
    });
  }
}
