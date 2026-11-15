import { CheckoutRequestSchema } from '@event-sharing/contracts';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import type { PaymentService } from '../services/PaymentService.js';

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  checkout: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const user = this.requireUser(request.authenticatedUser);
    const body = CheckoutRequestSchema.parse(request.body ?? {});
    response
      .status(201)
      .json(await this.service.checkout(eventId, user.id, body));
  };

  mine: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.service.mine(eventId, user.id));
  };

  forEvent: RequestHandler = async (request, response) => {
    const eventId = z.uuid().parse(request.params.eventId);
    const user = this.requireUser(request.authenticatedUser);
    response
      .status(200)
      .json(await this.service.forEvent(eventId, user.id, user.role));
  };

  account: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.service.account(user.id));
  };

  onboarding: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    response.status(200).json(await this.service.onboarding(user.id));
  };

  webhook: RequestHandler = async (request, response) => {
    const body = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
    const result = await this.service.webhook(
      body,
      request.get('stripe-signature'),
    );
    response.status(200).json({ received: true, result });
  };

  private requireUser(user: Express.Request['authenticatedUser']) {
    if (!user) throw new UnauthorizedError();
    return user;
  }
}
