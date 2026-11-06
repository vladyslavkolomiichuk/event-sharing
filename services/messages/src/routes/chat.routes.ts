import { Router } from 'express';
import type { ChatController } from '../controllers/ChatController.js';
import { PrivacyExportController } from '../controllers/PrivacyExportController.js';

export function chatRoutes(controller: ChatController): Router {
  const router = Router();
  router.get('/me/export', new PrivacyExportController().export);
  router.get('/overview', controller.overview);
  router.get('/events/:eventId/rooms', controller.listRooms);
  router.post('/events/:eventId/rooms', controller.createRoom);
  router.patch('/events/:eventId/rooms/:roomId', controller.updateRoom);
  router.patch(
    '/events/:eventId/rooms/:roomId/notifications',
    controller.updateNotificationPreference,
  );
  router.get('/events/:eventId/rooms/:roomId/members', controller.listMembers);
  router.post('/events/:eventId/rooms/:roomId/members', controller.addMembers);
  router.delete(
    '/events/:eventId/rooms/:roomId/members/:userId',
    controller.removeMember,
  );
  router.patch(
    '/events/:eventId/rooms/:roomId/archive',
    controller.archiveRoom,
  );
  router.get(
    '/events/:eventId/rooms/:roomId/messages',
    controller.listMessages,
  );
  router.post(
    '/events/:eventId/rooms/:roomId/messages',
    controller.sendMessage,
  );
  router.patch('/events/:eventId/rooms/:roomId/read', controller.markRead);
  return router;
}
