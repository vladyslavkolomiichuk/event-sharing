import { SearchModeSchema, type SearchMode } from '@event-sharing/contracts';
import { prisma } from '../database/client.js';

export class SearchPreferenceRepository {
  async get(userId: string): Promise<SearchMode | 'UNSET'> {
    const preference = await prisma.searchPreference.findUnique({
      where: { userId },
      select: { mode: true },
    });
    return preference ? SearchModeSchema.parse(preference.mode) : 'UNSET';
  }

  async save(userId: string, mode: SearchMode): Promise<void> {
    await prisma.searchPreference.upsert({
      where: { userId },
      create: { userId, mode },
      update: { mode },
    });
  }
}
