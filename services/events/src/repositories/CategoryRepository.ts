import { prisma } from '../database/client.js';
import { Prisma, type Category } from '../generated/prisma/client.js';
import { EventConflictError } from '../domain/errors/EventConflictError.js';

export class CategoryRepository {
  list(): Promise<Category[]> {
    return prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  findById(id: string): Promise<Category | null> {
    return prisma.category.findUnique({ where: { id } });
  }

  async create(name: string): Promise<Category> {
    try {
      return await prisma.category.create({ data: { name } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new EventConflictError(
          'CATEGORY_EXISTS',
          'A category with this name already exists.',
        );
      }
      throw error;
    }
  }
}
