import { Router } from 'express';
import type { UserProfileController } from '../controllers/UserProfileController.js';
import { FriendController } from '../controllers/FriendController.js';

export function userProfileRoutes(controller: UserProfileController): Router {
  const router = Router();
  const friends = new FriendController();
  router.get('/friends', friends.list);
  router.get('/invitation-target/:username', friends.invitationTarget);
  router.post('/friends/requests', friends.request);
  router.patch('/friends/requests/:id', friends.decide);
  router.delete('/friends/:username', friends.remove);
  router.put('/blocks/:username', friends.block);
  router.delete('/blocks/:username', friends.unblock);
  router.get('/me', controller.getMe);
  router.patch('/me', controller.updateMe);
  router.get('/', controller.listPublic);
  router.get('/search', controller.searchPublic);
  router.get('/by-username/:username', controller.getByUsername);
  router.get('/:userId', controller.getPublic);
  return router;
}
