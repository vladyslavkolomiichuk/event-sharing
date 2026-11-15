import express, { type Express } from 'express';
import { HealthResponseSchema } from '@event-sharing/contracts';
import type { ReadinessCheck } from '@event-sharing/common';
import { ParticipationController } from './controllers/ParticipationController.js';
import { PaymentController } from './controllers/PaymentController.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './middleware/not-found.js';
import { requireInternalJwt } from './middleware/require-internal-jwt.js';
import { ParticipationRepository } from './repositories/ParticipationRepository.js';
import { RegistrationPolicyRepository } from './repositories/RegistrationPolicyRepository.js';
import { participationRoutes } from './routes/participation.routes.js';
import { ParticipationService } from './services/ParticipationService.js';
import { PaymentService } from './services/PaymentService.js';

export function createApp(readinessCheck: ReadinessCheck): Express {
  const app = express();
  app.disable('x-powered-by');
  const payments = new PaymentController(new PaymentService());
  // Signature checks need the exact request bytes.
  app.post(
    '/api/public/payments/webhook',
    express.raw({ type: 'application/json', limit: '1mb' }),
    payments.webhook,
  );
  app.use(express.json());

  const controller = new ParticipationController(
    new ParticipationService(
      new RegistrationPolicyRepository(),
      new ParticipationRepository(),
    ),
  );
  app.use(
    '/api/participation',
    requireInternalJwt,
    participationRoutes(controller, payments),
  );

  app.get('/health', (_request, response) => {
    response
      .status(200)
      .json(
        HealthResponseSchema.parse({ service: 'Participation', status: 'ok' }),
      );
  });

  app.get('/ready', async (_request, response) => {
    const ready = await readinessCheck.check();
    response.status(ready ? 200 : 503).json(
      HealthResponseSchema.parse({
        service: 'Participation',
        status: ready ? 'ok' : 'unavailable',
      }),
    );
  });

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
