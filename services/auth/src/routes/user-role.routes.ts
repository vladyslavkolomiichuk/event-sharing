import { Router } from 'express';
import type { UserRoleController } from '../controllers/UserRoleController.js';
import { requireAdminSession } from '../middleware/require-admin-session.js';

export function userRoleRoutes(controller: UserRoleController): Router {
  const router = Router();
  router.patch('/users/:userId/role', requireAdminSession, controller.update);
  return router;
}
