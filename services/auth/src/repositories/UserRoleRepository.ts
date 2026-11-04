import { EVENT_TYPES, type UserRole } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class UserRoleRepository {
  findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true },
    });
  }

  async updateRole(
    userId: string,
    role: UserRole,
    actorId: string,
  ): Promise<void> {
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { role },
      });
      if (role === 'USER') return;

      const pending = await transaction.organizerRequest.findFirst({
        where: { userId, status: 'PENDING' },
      });
      if (!pending) return;

      const updated = await transaction.organizerRequest.updateMany({
        where: { id: pending.id, status: 'PENDING' },
        data: {
          status: 'APPROVED',
          decidedById: actorId,
          decidedAt: new Date(),
        },
      });
      if (updated.count === 0) return;
      await transaction.outboxEvent.create({
        data: {
          aggregateId: userId,
          eventType: EVENT_TYPES.organizerRequestResolved,
          payload: {
            requestId: pending.id,
            userId,
            decidedById: actorId,
            status: 'APPROVED',
            decisionReason: null,
          },
        },
      });
    });
  }
}
