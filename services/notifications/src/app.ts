import express, { type Express } from 'express';
import {
  HealthResponseSchema,
  REALTIME_SIGNAL_TYPES,
} from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { NotificationController } from './controllers/NotificationController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { notificationRoutes } from './routes/notification.routes.js';
import { MessageService } from './services/MessageService.js';
import { NotificationService } from './services/NotificationService.js';
import type { NotificationRealtimeServer } from './realtime/NotificationRealtimeServer.js';

export function createApp(
  readinessCheck: ReadinessCheck,
  realtime?: NotificationRealtimeServer,
): Express {
  const changed = (userIds: string[]) =>
    realtime?.publish(userIds, {
      type: REALTIME_SIGNAL_TYPES.notificationsChanged,
    });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(
    '/api/notifications',
    requireInternalJwt,
    notificationRoutes(
      new NotificationController(
        new NotificationService(undefined, changed),
        new MessageService(undefined, undefined, changed),
      ),
    ),
  );

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(
        HealthResponseSchema.parse({ service: 'Notifications', status: 'ok' }),
      );
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Notifications',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
