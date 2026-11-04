import { Router } from 'express';
import type { EventController } from '../controllers/EventController.js';

export function eventRoutes(controller: EventController): Router {
  const router = Router();
  router.get('/categories', controller.listCategories);
  router.post('/categories', controller.createCategory);
  router.get('/mine', controller.listMine);
  router.get('/mine/deletion-check', controller.deletionCheck);
  router.get('/mine/export', controller.exportMine);
  router.get('/moderation', controller.listModeration);
  router.get('/organizer/:organizerId', controller.listPublicByOrganizer);
  router.get('/', controller.listPublic);
  router.post('/', controller.create);
  router.get('/:eventId', controller.get);
  router.patch('/:eventId', controller.update);
  router.patch('/:eventId/chat', controller.updateChatSetting);
  router.post('/:eventId/submit', controller.action('submit'));
  router.post('/:eventId/approve', controller.action('approve'));
  router.post('/:eventId/reject', controller.action('reject'));
  router.post('/:eventId/publish', controller.action('publish'));
  router.post('/:eventId/registration/open', controller.action('open'));
  router.post('/:eventId/registration/close', controller.action('close'));
  router.post('/:eventId/start', controller.action('start'));
  router.post('/:eventId/complete', controller.action('complete'));
  router.post('/:eventId/cancel', controller.action('cancel'));
  router.post('/:eventId/archive', controller.action('archive'));
  return router;
}
