import type { UserRole } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class UserRoleRepository {
  async updateRole(
    userId: string,
    role: UserRole,
  ): Promise<{ id: string } | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      return null;
    }

    return prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true },
    });
  }
}
