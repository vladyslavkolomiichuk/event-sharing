import {
  UpdateUserProfileSchema,
  UsernameSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { ListPublicProfilesQuerySchema } from '../schemas/list-public-profiles.schema.js';
import { SearchPublicProfilesQuerySchema } from '../schemas/search-public-profiles.schema.js';
import type { UserProfileService } from '../services/UserProfileService.js';
import { prisma } from '../database/client.js';

export class UserProfileController {
  constructor(private readonly service: UserProfileService) {}

  getMe: RequestHandler = async (request, response) => {
    const userId = this.requireUserId(request.authenticatedUser?.id);
    response.status(200).json(await this.service.getPrivate(userId));
  };

  exportMe: RequestHandler = async (request, response) => {
    const userId = this.requireUserId(request.authenticatedUser?.id);
    const [profile, friendRequests, friendships, blocks] = await Promise.all([
      this.service.getPrivate(userId),
      prisma.friendRequest.findMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      }),
      prisma.friendship.findMany({
        where: { OR: [{ userIdA: userId }, { userIdB: userId }] },
      }),
      prisma.userBlock.findMany({ where: { blockerId: userId } }),
    ]);
    response
      .set('cache-control', 'no-store')
      .json({ profile, friendRequests, friendships, blocks });
  };

  getPublic: RequestHandler = async (request, response) => {
    const userId = z.uuid().parse(request.params.userId);
    response
      .status(200)
      .json(
        await this.service.getPublic(
          userId,
          this.requireUserId(request.authenticatedUser?.id),
        ),
      );
  };

  historyAccess: RequestHandler = async (request, response) => {
    const userId = z.uuid().parse(request.params.userId);
    const actorId = this.requireUserId(request.authenticatedUser?.id);
    response
      .set('cache-control', 'no-store')
      .json({ allowed: await this.service.canViewHistory(userId, actorId) });
  };

  getByUsername: RequestHandler = async (request, response) => {
    const username = UsernameSchema.parse(request.params.username);
    response
      .status(200)
      .json(
        await this.service.getPublicByUsername(
          username,
          this.requireUserId(request.authenticatedUser?.id),
        ),
      );
  };

  listPublic: RequestHandler = async (request, response) => {
    const { ids } = ListPublicProfilesQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        await this.service.getPublicMany(
          [...new Set(ids)],
          this.requireUserId(request.authenticatedUser?.id),
        ),
      );
  };

  searchPublic: RequestHandler = async (request, response) => {
    const userId = this.requireUserId(request.authenticatedUser?.id);
    const { username, cursor } = SearchPublicProfilesQuerySchema.parse(
      request.query,
    );
    response
      .status(200)
      .json(await this.service.searchByUsername(username, userId, cursor));
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
