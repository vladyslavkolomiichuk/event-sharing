import { Router } from 'express';
import type { NotificationController } from '../controllers/NotificationController.js';

export function notificationRoutes(controller: NotificationController): Router {
  const router = Router();
  router.get('/unread-count', controller.unreadCount);
  router.patch('/read-all', controller.markAllRead);
  router.post('/events/:eventId/messages', controller.sendEvent);
  router.get('/messages/:messageId', controller.getMessage);
  router.patch('/:notificationId/read', controller.markRead);
  router.get('/', controller.list);
  return router;
}
