import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { UserProfileController } from './controllers/UserProfileController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { UserProfileRepository } from './repositories/UserProfileRepository.js';
import { userProfileRoutes } from './routes/user-profile.routes.js';
import { UserProfileService } from './services/UserProfileService.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const controller = new UserProfileController(
    new UserProfileService(new UserProfileRepository()),
  );
  app.use('/api/users', requireInternalJwt, userProfileRoutes(controller));

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Users', status: 'ok' }));
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Users',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
