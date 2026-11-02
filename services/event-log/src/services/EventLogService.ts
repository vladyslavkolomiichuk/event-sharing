import { EventLogReadRepository } from '../repositories/EventLogReadRepository.js';
import type { EventLogListQuery } from '../schemas/event-log-query.schema.js';

export class EventLogService {
  constructor(private readonly repository = new EventLogReadRepository()) {}

  list(query: EventLogListQuery) {
    return this.repository.list(query);
  }

  analytics(days: number) {
    return this.repository.analytics(days);
  }
}
