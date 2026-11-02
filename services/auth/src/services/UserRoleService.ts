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
    username: string,
    role: UserRole,
  ): Promise<{ id: string; role: UserRole }> {
    if (actorRole !== 'ADMIN') {
      throw new ForbiddenError();
    }

    const user = await this.repository.findByUsername(username);
    if (!user) throw new UserNotFoundError();

    if (actorId === user.id && role !== 'ADMIN') {
      throw new SelfDemotionError();
    }

    await this.repository.updateRole(user.id, role);

    return { id: user.id, role };
  }
}
