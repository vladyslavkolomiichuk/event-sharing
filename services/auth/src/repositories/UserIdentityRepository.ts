import type { UpdateIdentity } from '@event-sharing/contracts';
import { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../database/client.js';
import { UsernameTakenError } from '../domain/errors/UsernameTakenError.js';

export class UserIdentityRepository {
  async available(username: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    return user === null;
  }

  async availableSuggestions(candidates: string[]): Promise<string[]> {
    if (!candidates.length) return [];
    const users = await prisma.user.findMany({
      where: { username: { in: candidates } },
      select: { username: true },
    });
    const taken = new Set(users.map((user) => user.username));
    return candidates.filter((candidate) => !taken.has(candidate)).slice(0, 2);
  }

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
