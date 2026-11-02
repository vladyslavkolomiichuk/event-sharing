import { Router } from 'express';
import type { GeoSearchController } from '../controllers/GeoSearchController.js';

export function searchRoutes(controller: GeoSearchController): Router {
  const router = Router();
  router.post('/events', controller.search);
  return router;
}
