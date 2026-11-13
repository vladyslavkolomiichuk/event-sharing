import { Router } from 'express';
import type { GeoSearchController } from '../controllers/GeoSearchController.js';

export function searchRoutes(controller: GeoSearchController): Router {
  const router = Router();
  router.get('/preference', controller.getPreference);
  router.put('/preference', controller.savePreference);
  router.post('/events', controller.search);
  router.post('/events/map', controller.map);
  router.post('/route', controller.route);
  return router;
}
