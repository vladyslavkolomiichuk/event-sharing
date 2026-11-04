import cors from 'cors';
import express, { type Express, type RequestHandler } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ServiceHealthClient } from './clients/ServiceHealthClient.js';
import { env } from './config/env.js';
import { SystemController } from './controllers/SystemController.js';
import { DataExportController } from './controllers/DataExportController.js';
import { blockPublicAuthToken } from './middleware/block-public-auth-token.js';
import { errorHandler } from './middleware/error-handler.js';
import { GatewayRateLimiter } from './middleware/GatewayRateLimiter.js';
import { notFound } from './middleware/not-found.js';
import { assignRequestId } from './middleware/request-id.js';
import { requireRole } from './middleware/require-role.js';
import { requireCompleteProfile } from './middleware/require-complete-profile.js';
import { systemRoutes } from './routes/system.routes.js';

export type GatewayAppDependencies = {
  clients: ServiceHealthClient[];
  authProxy: RequestHandler;
  authenticateBrowserSession: RequestHandler;
  serviceProxies: {
    users: RequestHandler;
    events: RequestHandler;
    search: RequestHandler;
    participation: RequestHandler;
    notifications: RequestHandler;
    messages: RequestHandler;
    eventLog: RequestHandler;
    storage: RequestHandler;
  };
};

export function createApp(dependencies: GatewayAppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(assignRequestId);
  app.use(blockPublicAuthToken);
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  const authRateLimiter = new GatewayRateLimiter(120, 60_000);
  const credentialRateLimiter = new GatewayRateLimiter(10, 60_000);
  const userSearchRateLimiter = new GatewayRateLimiter(60, 60_000);
  const routeRateLimiter = new GatewayRateLimiter(30, 60_000);
  const dataExportRateLimiter = new GatewayRateLimiter(3, 60_000);
  const storageUploadRateLimiter = new GatewayRateLimiter(
    20,
    60_000,
    10_000,
    (request) => request.authenticatedUser?.id,
  );
  app.use('/auth', authRateLimiter.middleware());
  app.use(
    ['/auth/sign-in/email', '/auth/sign-up/email'],
    credentialRateLimiter.middleware(),
  );
  app.use('/auth', dependencies.authProxy);

  const authenticate = dependencies.authenticateBrowserSession;
  app.get(
    '/api/privacy/export',
    dataExportRateLimiter.middleware(),
    authenticate,
    new DataExportController().export,
  );
  app.use('/api', authenticate, requireCompleteProfile);
  app.use('/api/users/search', userSearchRateLimiter.middleware());
  app.use('/api/users', dependencies.serviceProxies.users);
  app.use('/api/events', dependencies.serviceProxies.events);
  app.use('/api/search/route', routeRateLimiter.middleware());
  app.use('/api/search', dependencies.serviceProxies.search);
  app.use('/api/participation', dependencies.serviceProxies.participation);
  app.use('/api/notifications', dependencies.serviceProxies.notifications);
  app.use('/api/messages', dependencies.serviceProxies.messages);
  app.use(
    '/api/storage',
    (request, response, next) => {
      if (request.method === 'POST' || request.method === 'PUT')
        return storageUploadRateLimiter.middleware()(request, response, next);
      next();
    },
    dependencies.serviceProxies.storage,
  );
  app.use(
    '/api/event-log',
    requireRole('ADMIN'),
    dependencies.serviceProxies.eventLog,
  );

  app.use(express.json());

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Gateway', status: 'ok' }));
  });

  app.get('/ready', (_request, response) => {
    response
      .status(200)
      .json(HealthResponseSchema.parse({ service: 'Gateway', status: 'ok' }));
  });

  app.use(
    '/api/system',
    requireRole('ADMIN'),
    systemRoutes(new SystemController(dependencies.clients)),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
