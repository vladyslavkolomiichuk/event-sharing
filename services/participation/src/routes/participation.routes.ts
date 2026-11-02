import { Router } from 'express';
import type { ParticipationController } from '../controllers/ParticipationController.js';

export function participationRoutes(
  controller: ParticipationController,
): Router {
  const router = Router();
  router.get('/me', controller.mine);
  router.get('/events/:eventId/availability', controller.availability);
  router.get('/events/:eventId/participants', controller.participants);
  router.post('/events/:eventId/join', controller.join);
  router.delete('/events/:eventId/join', controller.leave);
  return router;
}
