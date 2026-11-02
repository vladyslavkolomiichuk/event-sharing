import { Router } from 'express';
import type { ChatController } from '../controllers/ChatController.js';

export function chatRoutes(controller: ChatController): Router {
  const router = Router();
  router.get('/overview', controller.overview);
  router.get('/events/:eventId/rooms', controller.listRooms);
  router.post('/events/:eventId/rooms', controller.createRoom);
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
