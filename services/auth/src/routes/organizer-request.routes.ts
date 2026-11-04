import { Router } from 'express';
import type { OrganizerRequestController } from '../controllers/OrganizerRequestController.js';
import { requireAdminSession } from '../middleware/require-admin-session.js';
import { requireTrustedOrigin } from '../middleware/require-trusted-origin.js';
import { requireUserSession } from '../middleware/require-user-session.js';

export function organizerRequestRoutes(controller: OrganizerRequestController) {
  const member = Router();
  member.get('/me', requireUserSession, controller.current);
  member.post('/', requireTrustedOrigin, requireUserSession, controller.create);

  const admin = Router();
  admin.get('/', requireAdminSession, controller.pending);
  admin.post(
    '/:requestId/approve',
    requireTrustedOrigin,
    requireAdminSession,
    controller.approve,
  );
  admin.post(
    '/:requestId/reject',
    requireTrustedOrigin,
    requireAdminSession,
    controller.reject,
  );
  return { member, admin };
}
