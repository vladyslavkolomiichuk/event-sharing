import { Router } from 'express';
import type { NotificationController } from '../controllers/NotificationController.js';
import { PrivacyExportController } from '../controllers/PrivacyExportController.js';

export function notificationRoutes(controller: NotificationController): Router {
  const router = Router();
  router.get('/me/export', new PrivacyExportController().export);
  router.get('/unread-count', controller.unreadCount);
  router.patch('/read-all', controller.markAllRead);
  router.post('/events/:eventId/messages', controller.sendEvent);
  router.get('/messages/:messageId', controller.getMessage);
  router.patch('/:notificationId/read', controller.markRead);
  router.delete('/:notificationId', controller.remove);
  router.get('/', controller.list);
  return router;
}
