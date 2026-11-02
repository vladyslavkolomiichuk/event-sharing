import { EventSearchQuerySchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import type { GeoSearchService } from '../services/GeoSearchService.js';

export class GeoSearchController {
  constructor(private readonly service: GeoSearchService) {}

  search: RequestHandler = async (request, response) => {
    const query = EventSearchQuerySchema.parse(request.body);
    response.status(200).json(await this.service.search(query));
  };
}
