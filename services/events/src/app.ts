import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { EventController } from './controllers/EventController.js';
import { EventPrivacyController } from './controllers/EventPrivacyController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { eventRoutes } from './routes/event.routes.js';
import { EventService } from './services/EventService.js';
import { publicEventRoutes } from './routes/public-event.routes.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.post(
    '/internal/privacy/reserve-events',
    new EventPrivacyController().reserve,
  );
  app.use('/api/public/events', publicEventRoutes());
  app.use(
    '/api/events',
    requireInternalJwt,
    eventRoutes(new EventController(new EventService())),
  );

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Events', status: 'ok' }));
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Events',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
