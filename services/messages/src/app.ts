import express, { type Express } from 'express';
import {
  HealthResponseSchema,
  REALTIME_SIGNAL_TYPES,
} from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { ChatController } from './controllers/ChatController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { chatRoutes } from './routes/chat.routes.js';
import { ChatService } from './services/ChatService.js';
import type { MessageRealtimeServer } from './realtime/MessageRealtimeServer.js';

export function createApp(
  readinessCheck: ReadinessCheck,
  realtime?: MessageRealtimeServer,
): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(
    '/api/messages',
    requireInternalJwt,
    chatRoutes(
      new ChatController(
        new ChatService(undefined, (userIds, eventId, roomId, message) =>
          realtime?.publish(userIds, {
            type: REALTIME_SIGNAL_TYPES.messagesChanged,
            eventId,
            roomId,
            message,
          }),
        ),
      ),
    ),
  );
  app.get('/health', (_request, response) =>
    response.json(
      HealthResponseSchema.parse({ service: 'Messages', status: 'ok' }),
    ),
  );
  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Messages',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
