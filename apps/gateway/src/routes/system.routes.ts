import { Router } from 'express';
import type { SystemController } from '../controllers/SystemController.js';

export function systemRoutes(controller: SystemController): Router {
  const router = Router();
  router.get('/services', controller.listServices);
  return router;
}
