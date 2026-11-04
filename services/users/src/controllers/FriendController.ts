import { UsernameSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { FriendService } from '../services/FriendService.js';

export class FriendController {
  constructor(private readonly service = new FriendService()) {}

  private actor(id: string | undefined): string {
    if (!id) throw new UnauthorizedError();
    return id;
  }

  list: RequestHandler = async (request, response) => {
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000)
      .default(0)
      .parse(request.query.page);
    response.json(
      await this.service.list(this.actor(request.authenticatedUser?.id), page),
    );
  };

  search: RequestHandler = async (request, response) => {
    const query = z.string().trim().max(100).default('').parse(request.query.q);
    const sort = z
      .enum(['name', 'username'])
      .default('name')
      .parse(request.query.sort);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000)
      .default(0)
      .parse(request.query.page);
    response.json(
      await this.service.search(
        this.actor(request.authenticatedUser?.id),
        query,
        sort,
        page,
      ),
    );
  };

  invitationTarget: RequestHandler = async (request, response) => {
    const username = UsernameSchema.parse(request.params.username);
    response.json(
      await this.service.invitationTarget(
        this.actor(request.authenticatedUser?.id),
        username,
      ),
    );
  };

  request: RequestHandler = async (request, response) => {
    const username = UsernameSchema.parse(request.body?.username);
    response
      .status(201)
      .json(
        await this.service.request(
          this.actor(request.authenticatedUser?.id),
          username,
        ),
      );
  };

  decide: RequestHandler = async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const action = z
      .enum(['ACCEPTED', 'REJECTED', 'CANCELLED'])
      .parse(request.body?.action);
    response.json(
      await this.service.decide(
        this.actor(request.authenticatedUser?.id),
        id,
        action,
      ),
    );
  };

  remove: RequestHandler = async (request, response) => {
    await this.service.remove(
      this.actor(request.authenticatedUser?.id),
      UsernameSchema.parse(request.params.username),
    );
    response.status(204).end();
  };

  block: RequestHandler = async (request, response) => {
    await this.service.block(
      this.actor(request.authenticatedUser?.id),
      UsernameSchema.parse(request.params.username),
    );
    response.status(204).end();
  };

  unblock: RequestHandler = async (request, response) => {
    await this.service.unblock(
      this.actor(request.authenticatedUser?.id),
      UsernameSchema.parse(request.params.username),
    );
    response.status(204).end();
  };
}
