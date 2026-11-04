import type { CreateSystemMessage, UserRole } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class SystemMessageRepository {
  create(input: CreateSystemMessage) {
    return prisma.systemMessage.create({ data: input });
  }

  list(role: UserRole, cursor?: string) {
    return prisma.systemMessage.findMany({
      where:
        role === 'ADMIN'
          ? {}
          : {
              audience: {
                in: role === 'ORGANIZER' ? ['ALL', 'ORGANIZER'] : ['ALL'],
              },
            },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 21,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  find(id: string) {
    return prisma.systemMessage.findUnique({ where: { id } });
  }

  remove(id: string) {
    return prisma.systemMessage.deleteMany({ where: { id } });
  }
}
