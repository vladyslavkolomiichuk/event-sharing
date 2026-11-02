import type { UserRole } from '@event-sharing/contracts';
import { ForbiddenError } from '../domain/errors/ForbiddenError.js';
import { SelfDemotionError } from '../domain/errors/SelfDemotionError.js';
import { UserNotFoundError } from '../domain/errors/UserNotFoundError.js';
import type { UserRoleRepository } from '../repositories/UserRoleRepository.js';

export class UserRoleService {
  constructor(private readonly repository: UserRoleRepository) {}

  async changeRole(
    actorId: string,
    actorRole: UserRole,
    userId: string,
    role: UserRole,
  ): Promise<{ id: string; role: UserRole }> {
    if (actorRole !== 'ADMIN') {
      throw new ForbiddenError();
    }

    if (actorId === userId && role !== 'ADMIN') {
      throw new SelfDemotionError();
    }

    const user = await this.repository.updateRole(userId, role);
    if (!user) {
      throw new UserNotFoundError();
    }

    return { id: user.id, role };
  }
}
