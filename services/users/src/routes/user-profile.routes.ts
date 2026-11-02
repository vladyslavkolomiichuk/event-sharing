import { Router } from 'express';
import type { UserProfileController } from '../controllers/UserProfileController.js';

export function userProfileRoutes(controller: UserProfileController): Router {
  const router = Router();
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  router.get('/', controller.listPublic);
  router.get('/search', controller.searchPublic);
  router.get('/:userId', controller.getPublic);
  return router;
}
