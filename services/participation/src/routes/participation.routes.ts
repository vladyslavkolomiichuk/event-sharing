import { Router } from 'express';
import type { ParticipationController } from '../controllers/ParticipationController.js';
import { InvitationController } from '../controllers/InvitationController.js';
import { PrivacyExportController } from '../controllers/PrivacyExportController.js';
import { ParticipationHistoryController } from '../controllers/ParticipationHistoryController.js';

export function participationRoutes(
  controller: ParticipationController,
): Router {
  const router = Router();
  const invitations = new InvitationController();
  router.delete(
    '/me/history/:eventId',
    new ParticipationHistoryController().hide,
  );
  router.get('/invitations', invitations.incoming);
  router.get('/invitations/link/:token', invitations.previewLink);
  router.post('/invitations/link/:token/accept', invitations.acceptLink);
  router.post('/invitations/:inviteId/accept', invitations.accept);
  router.post('/invitations/:inviteId/decline', invitations.decline);
  router.delete('/invitations/:inviteId', invitations.revoke);
  router.get('/events/:eventId/invitations', invitations.outgoing);
  router.post('/events/:eventId/invitations', invitations.send);
  router.get('/events/:eventId/invite-links', invitations.links);
  router.post('/events/:eventId/invite-links', invitations.createLink);
  router.delete(
    '/events/:eventId/invite-links/:linkId',
    invitations.revokeLink,
  );
  router.get('/me', controller.mine);
  router.get('/me/export', new PrivacyExportController().export);
  router.get(
    '/users/:userId/history',
    new ParticipationHistoryController().list,
  );
  router.get('/events/:eventId/availability', controller.availability);
  router.get('/events/:eventId/participants', controller.participants);
  router.get('/events/:eventId/members/:userId', controller.memberStatus);
  router.post('/events/:eventId/join', controller.join);
  router.delete('/events/:eventId/join', controller.leave);
  return router;
}
