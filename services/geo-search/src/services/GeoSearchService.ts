import {
  EVENT_TYPES,
  SearchPerformedPayloadSchema,
  type EventSearchQuery,
  type SearchMode,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { LocationPreferenceRequiredError } from '../domain/errors/LocationPreferenceRequiredError.js';
import { SearchPreferenceRepository } from '../repositories/SearchPreferenceRepository.js';
import { SearchRepository } from '../repositories/SearchRepository.js';

export class GeoSearchService {
  constructor(
    private readonly repository = new SearchRepository(),
    private readonly preferences = new SearchPreferenceRepository(),
  ) {}

  async getPreference(userId: string) {
    return { mode: await this.preferences.get(userId) };
  }

  async savePreference(userId: string, mode: SearchMode) {
    await this.preferences.save(userId, mode);
    return { mode };
  }

  async search(userId: string, query: EventSearchQuery) {
    if (
      query.locationSource &&
      (await this.preferences.get(userId)) !== query.locationSource
    ) {
      throw new LocationPreferenceRequiredError();
    }
    const result = await this.repository.search(query);
    try {
      await prisma.outboxEvent.create({
        data: {
          eventType: EVENT_TYPES.searchPerformed,
          payload: SearchPerformedPayloadSchema.parse({
            hasText: Boolean(query.text),
            hasCategory: Boolean(query.categoryId),
            hasLocation: query.latitude !== undefined,
            resultCount: result.items.length,
          }),
        },
      });
    } catch {
      console.error('Search telemetry could not be queued.');
    }
    return result;
  }
}
