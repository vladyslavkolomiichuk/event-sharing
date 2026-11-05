import { Router } from 'express';
import { z } from 'zod';
import { EventSearchResultSchema } from '@event-sharing/contracts';
import { PublicEventRepository } from '../repositories/PublicEventRepository.js';

export function publicEventRoutes(): Router {
  const router = Router();
  const events = new PublicEventRepository();

  router.get('/map', async (request, response) => {
    const limit = z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(100)
      .parse(request.query.limit);
    const items = await events.map(limit);
    response
      .set('Cache-Control', 'no-store')
      .json(EventSearchResultSchema.parse({ items, nextCursor: null }));
  });

  router.get('/:eventId/availability', async (request, response) => {
    const id = z.uuid().parse(request.params.eventId);
    response.set('Cache-Control', 'no-store');
    if (!(await events.isVisible(id))) return response.sendStatus(404);
    return response.sendStatus(204);
  });

  return router;
}
