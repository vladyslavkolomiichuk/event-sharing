import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { ListMembershipsQuerySchema } from '../schemas/list-memberships.schema.js';
import type { ParticipationService } from '../services/ParticipationService.js';

export class ParticipationController {
  constructor(private readonly service: ParticipationService) {}

  availability: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    response.status(200).json(await this.service.availability(eventId));
  };

  join: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const user = this.requireUser(request.authenticatedUser);
    z.strictObject({}).parse(request.body ?? {});
    response.status(200).json(await this.service.join(eventId, user.id));
  };

  leave: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.service.leave(eventId, user.id));
  };

  participants: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const { cursor } = ListMembershipsQuerySchema.parse(request.query);
    const user = this.requireUser(request.authenticatedUser);
    response
      .status(200)
      .json(
        await this.service.participants(eventId, user.id, user.role, cursor),
      );
  };

  memberStatus: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const targetId = z.uuid().parse(request.params.userId);
    const user = this.requireUser(request.authenticatedUser);
    response
      .status(200)
      .json(
        await this.service.memberStatus(eventId, targetId, user.id, user.role),
      );
  };

  mine: RequestHandler = async (request, response) => {
    const { cursor } = ListMembershipsQuerySchema.parse(request.query);
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.service.mine(user.id, cursor));
  };

  private requireUser(user: Express.Request['authenticatedUser']) {
    if (!user) throw new UnauthorizedError();
    return user;
  }
}
