import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { toNodeHandler } from 'better-auth/node';
import { UserRoleController } from './controllers/UserRoleController.js';
import { UserIdentityController } from './controllers/UserIdentityController.js';
import { OrganizerRequestController } from './controllers/OrganizerRequestController.js';
import { PrivacyController } from './controllers/PrivacyController.js';
import {
  accountMailAvailable,
  auth,
  socialProvidersAvailable,
} from './lib/auth.js';
import { prisma } from './database/client.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireUserSession } from './middleware/require-user-session.js';
import { requireTrustedOrigin } from './middleware/require-trusted-origin.js';
import { UserRoleRepository } from './repositories/UserRoleRepository.js';
import { userRoleRoutes } from './routes/user-role.routes.js';
import { organizerRequestRoutes } from './routes/organizer-request.routes.js';
import { UserRoleService } from './services/UserRoleService.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  const roleController = new UserRoleController(
    new UserRoleService(new UserRoleRepository()),
  );
  const privacyController = new PrivacyController();
  const organizerRequests = organizerRequestRoutes(
    new OrganizerRequestController(),
  );
  app.use(
    '/backend/auth/organizer-requests',
    express.json(),
    organizerRequests.member,
  );
  app.use(
    '/backend/auth/admin/organizer-requests',
    express.json(),
    organizerRequests.admin,
  );
  app.get(
    '/backend/auth/privacy/export',
    requireUserSession,
    privacyController.export,
  );
  app.get(
    '/backend/auth/privacy/deletion-request',
    requireUserSession,
    privacyController.deletionRequest,
  );
  app.post(
    '/backend/auth/privacy/deletion-request',
    requireTrustedOrigin,
    requireUserSession,
    privacyController.requestDeletion,
  );
  app.get(
    '/backend/auth/admin/privacy-requests',
    requireUserSession,
    privacyController.pendingRequests,
  );
  app.use(
    '/backend/auth/admin',
    requireTrustedOrigin,
    express.json(),
    userRoleRoutes(roleController),
  );
  app.patch(
    '/backend/auth/identity',
    requireTrustedOrigin,
    express.json(),
    requireUserSession,
    new UserIdentityController().update,
  );
  app.get(
    '/backend/auth/username-availability',
    new UserIdentityController().availability,
  );
  app.get(
    '/backend/auth/username-suggestions',
    new UserIdentityController().suggestions,
  );
  app.get('/backend/auth/account-capabilities', (_request, response) => {
    response.status(200).json({
      emailDeliveryAvailable: accountMailAvailable,
      socialProviders: socialProvidersAvailable,
    });
  });
  app.get(
    '/backend/auth/social-accounts',
    requireUserSession,
    async (request, response) => {
      const accounts = await prisma.account.findMany({
        where: {
          userId: request.authUser!.id,
          providerId: { in: ['google', 'github'] },
        },
        select: { providerId: true },
      });
      response
        .status(200)
        .json({ providers: accounts.map((account) => account.providerId) });
    },
  );
  app.all('/backend/auth/*splat', toNodeHandler(auth));
  app.use(express.json());

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Auth', status: 'ok' }));
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Auth',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
