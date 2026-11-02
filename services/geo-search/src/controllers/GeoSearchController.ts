import {
  EventSearchQuerySchema,
  UpdateSearchPreferenceSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import type { GeoSearchService } from '../services/GeoSearchService.js';

export class GeoSearchController {
  constructor(private readonly service: GeoSearchService) {}

  search: RequestHandler = async (request, response) => {
    const userId = this.userId(request.authenticatedUser?.id);
    const query = EventSearchQuerySchema.parse(request.body);
    response.status(200).json(await this.service.search(userId, query));
  };

  getPreference: RequestHandler = async (request, response) => {
    const userId = this.userId(request.authenticatedUser?.id);
    response.status(200).json(await this.service.getPreference(userId));
  };

  savePreference: RequestHandler = async (request, response) => {
    const userId = this.userId(request.authenticatedUser?.id);
    const { mode } = UpdateSearchPreferenceSchema.parse(request.body);
    response.status(200).json(await this.service.savePreference(userId, mode));
  };

  private userId(value: string | undefined): string {
    if (!value) throw new UnauthorizedError();
    return value;
  }
}
