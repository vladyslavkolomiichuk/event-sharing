import { UpdateUserProfileSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { ListPublicProfilesQuerySchema } from '../schemas/list-public-profiles.schema.js';
import { SearchPublicProfilesQuerySchema } from '../schemas/search-public-profiles.schema.js';
import type { UserProfileService } from '../services/UserProfileService.js';

export class UserProfileController {
  constructor(private readonly service: UserProfileService) {}

  getMe: RequestHandler = async (request, response) => {
    const userId = this.requireUserId(request.authenticatedUser?.id);
    response.status(200).json(await this.service.getPrivate(userId));
  };

  getPublic: RequestHandler = async (request, response) => {
    const userId = z.uuid().parse(request.params.userId);
    response.status(200).json(await this.service.getPublic(userId));
  };

  listPublic: RequestHandler = async (request, response) => {
    const { ids } = ListPublicProfilesQuerySchema.parse(request.query);
    response
      .status(200)
      .json(await this.service.getPublicMany([...new Set(ids)]));
  };

  searchPublic: RequestHandler = async (request, response) => {
    const user = request.authenticatedUser;
    if (!user) throw new UnauthorizedError();
    const { name } = SearchPublicProfilesQuerySchema.parse(request.query);
    response.status(200).json(await this.service.searchByName(name, user.role));
  };

  updateMe: RequestHandler = async (request, response) => {
    const userId = this.requireUserId(request.authenticatedUser?.id);
    const patch = UpdateUserProfileSchema.parse(request.body);
    response.status(200).json(await this.service.update(userId, patch));
  };

  private requireUserId(userId: string | undefined): string {
    if (!userId) throw new UnauthorizedError();
    return userId;
  }
}
