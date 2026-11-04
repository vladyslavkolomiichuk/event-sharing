import express, { type ErrorRequestHandler } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import { mapApiError, type ReadinessCheck } from '@event-sharing/common';
import { env } from './config/env.js';
import { FileController } from './controllers/FileController.js';
import { StorageError } from './domain/StorageError.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { FileStorageService } from './services/FileStorageService.js';

export function createApp(
  readiness: ReadinessCheck,
  service: FileStorageService,
) {
  const app = express();
  const controller = new FileController(service);
  const raw = express.raw({
    type: () => true,
    limit: env.STORAGE_MAX_FILE_BYTES,
  });
  app.disable('x-powered-by');
  app.use(
    '/api/storage',
    (_request, response, next) => {
      response.set('Cache-Control', 'private, no-store');
      next();
    },
    requireInternalJwt,
  );
  app.get('/api/storage/me/export', controller.export);
  app.get('/api/storage/files', controller.list);
  app.post('/api/storage/files', raw, controller.upload);
  app.get('/api/storage/files/:id', controller.get);
  app.delete('/api/storage/files/:id', controller.remove);
  app.get('/api/storage/events/:eventId', controller.eventImages);
  app.get('/api/storage/events/:eventId/:slot', controller.getEventImage);
  app.put(
    '/api/storage/events/:eventId/:slot',
    raw,
    controller.uploadEventImage,
  );
  app.delete('/api/storage/events/:eventId/:slot', controller.removeEventImage);
  app.get('/health', (_request, response) =>
    response.json(
      HealthResponseSchema.parse({ service: 'Storage', status: 'ok' }),
    ),
  );
  app.get('/ready', async (_request, response) => {
    const [databaseReady, scannerReady] = await Promise.all([
      readiness.check(),
      service.scannerReady(),
    ]);
    const ready = databaseReady && scannerReady;
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Storage',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });
  app.use((_request, response) =>
    response.status(404).json({
      code: 'NOT_FOUND',
      message: 'The requested resource was not found.',
      details: [],
    }),
  );
  const errors: ErrorRequestHandler = (error, _request, response, _next) => {
    const cause =
      error?.type === 'entity.too.large'
        ? new StorageError('The file is too large.', 'FILE_TOO_LARGE', 413)
        : error;
    const mapped = mapApiError(cause);
    if (mapped.unexpected)
      console.error(
        'Storage request failed.',
        cause instanceof Error ? cause.name : 'UnknownError',
      );
    response.status(mapped.statusCode).json(mapped.body);
  };
  app.use(errors);
  return app;
}
