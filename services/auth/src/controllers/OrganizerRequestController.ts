import {
  CreateOrganizerRequestSchema,
  DecideOrganizerRequestSchema,
} from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { OrganizerRequestService } from '../services/OrganizerRequestService.js';

export class OrganizerRequestController {
  constructor(private readonly service = new OrganizerRequestService()) {}

  readonly current: RequestHandler = async (request, response) => {
    response
      .status(200)
      .json({ request: await this.service.current(this.userId(request)) });
  };

  readonly create: RequestHandler = async (request, response) => {
    const { reason } = CreateOrganizerRequestSchema.parse(request.body);
    response
      .status(201)
      .json(await this.service.create(this.userId(request), reason));
  };

  readonly pending: RequestHandler = async (_request, response) => {
    response.status(200).json(await this.service.pending());
  };

  readonly approve: RequestHandler = async (request, response) => {
    const id = z.uuid().parse(request.params.requestId);
    const { decisionReason } = DecideOrganizerRequestSchema.parse(request.body);
    response
      .status(200)
      .json(
        await this.service.decide(
          id,
          this.userId(request),
          'APPROVED',
          decisionReason,
        ),
      );
  };

  readonly reject: RequestHandler = async (request, response) => {
    const id = z.uuid().parse(request.params.requestId);
    const { decisionReason } = DecideOrganizerRequestSchema.parse(request.body);
    response
      .status(200)
      .json(
        await this.service.decide(
          id,
          this.userId(request),
          'REJECTED',
          decisionReason,
        ),
      );
  };

  private userId(request: Express.Request): string {
    if (!request.authUser) throw new UnauthorizedError();
    return request.authUser.id;
  }
}
