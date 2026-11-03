import { UpdateIdentitySchema, UsernameSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { UserIdentityService } from '../services/UserIdentityService.js';

export class UserIdentityController {
  constructor(private readonly service = new UserIdentityService()) {}

  readonly update: RequestHandler = async (request, response) => {
    const userId = request.authUser?.id;
    if (!userId) throw new UnauthorizedError();
    const changes = UpdateIdentitySchema.parse(request.body);
    response.status(200).json(await this.service.update(userId, changes));
  };

  readonly availability: RequestHandler = async (request, response) => {
    const username = UsernameSchema.parse(request.query.username);
    response
      .status(200)
      .json({ available: await this.service.available(username) });
  };
}
