import { Router } from 'express';
import type { EventLogController } from '../controllers/EventLogController.js';

export function eventLogRoutes(controller: EventLogController): Router {
  const router = Router();
  router.get('/entries', controller.list);
  router.get('/analytics', controller.analytics);
  return router;
}
