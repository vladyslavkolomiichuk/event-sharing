import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { ParticipationHistoryService } from '../services/ParticipationHistoryService.js';

export class ParticipationHistoryController {
  constructor(private readonly service = new ParticipationHistoryService()) {}

  list: RequestHandler = async (request, response) => {
    const actorId = request.authenticatedUser?.id;
    if (!actorId) throw new UnauthorizedError();
    const userId = z.uuid().parse(request.params.userId);
    const page = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000)
      .default(0)
      .parse(request.query.page);
    response
      .set('cache-control', 'no-store')
      .json(
        await this.service.list(
          userId,
          actorId,
          request.get('authorization') ?? '',
          page,
        ),
      );
  };
}
