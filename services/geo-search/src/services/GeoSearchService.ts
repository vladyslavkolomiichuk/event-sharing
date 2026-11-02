import {
  EVENT_TYPES,
  SearchPerformedPayloadSchema,
  type EventSearchQuery,
} from '@event-sharing/contracts';
import { prisma } from '../database/client.js';
import { SearchRepository } from '../repositories/SearchRepository.js';

export class GeoSearchService {
  constructor(private readonly repository = new SearchRepository()) {}

  async search(query: EventSearchQuery) {
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
