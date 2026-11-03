import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { EventLogController } from './controllers/EventLogController.js';
import { PrivacyExportController } from './controllers/PrivacyExportController.js';
import { requireAdminJwt } from './middleware/require-admin-jwt.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { eventLogRoutes } from './routes/event-log.routes.js';
import { EventLogService } from './services/EventLogService.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.get('/api/event-log/me/export', new PrivacyExportController().export);
  app.use(
    '/api/event-log',
    requireAdminJwt,
    eventLogRoutes(new EventLogController(new EventLogService())),
  );

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Event Log', status: 'ok' }));
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Event Log',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
