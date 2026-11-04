import { CreateSystemMessageSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import type { SystemMessageService } from '../services/SystemMessageService.js';

const ListQuerySchema = z.strictObject({ cursor: z.uuid().optional() });

export class SystemMessageController {
  constructor(private readonly service: SystemMessageService) {}

  list: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const { cursor } = ListQuerySchema.parse(request.query);
    response.status(200).json(await this.service.list(user.role, cursor));
  };

  create: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const input = CreateSystemMessageSchema.parse(request.body);
    response.status(201).json(await this.service.create(user.role, input));
  };

  remove: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.messageId);
    response.status(200).json(await this.service.remove(id, user.role));
  };

  private requireUser(user: Express.Request['authenticatedUser']) {
    if (!user) throw new UnauthorizedError();
    return user;
  }
}
