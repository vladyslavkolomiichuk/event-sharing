import type { UserRole } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class UserRoleRepository {
  findByUsername(username: string) {
    return prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
  }

  async updateRole(userId: string, role: UserRole): Promise<void> {
    await prisma.user.update({
      where: { id: userId },
      data: { role },
    });
  }
}
