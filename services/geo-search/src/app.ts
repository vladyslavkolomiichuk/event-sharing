import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { GeoSearchController } from './controllers/GeoSearchController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { searchRoutes } from './routes/search.routes.js';
import { GeoSearchService } from './services/GeoSearchService.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(
    '/api/search',
    requireInternalJwt,
    searchRoutes(new GeoSearchController(new GeoSearchService())),
  );

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(
        HealthResponseSchema.parse({ service: 'Geo Search', status: 'ok' }),
      );
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Geo Search',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
