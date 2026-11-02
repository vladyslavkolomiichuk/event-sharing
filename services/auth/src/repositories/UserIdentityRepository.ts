import type { UpdateIdentity } from '@event-sharing/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { UsernameTakenError } from '../domain/errors/UsernameTakenError.js';

export class UserIdentityRepository {
  async update(userId: string, changes: UpdateIdentity) {
    try {
      return await prisma.user.update({
        where: { id: userId },
        data: {
          ...(changes.name !== undefined ? { name: changes.name } : {}),
          ...(changes.username !== undefined
            ? { username: changes.username }
            : {}),
        },
        select: { id: true, name: true, username: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new UsernameTakenError();
      }
      throw error;
    }
  }
}
