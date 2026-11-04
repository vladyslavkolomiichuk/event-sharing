import {
  CreateCategorySchema,
  CreateEventSchema,
  UpdateEventSchema,
  UpdateEventChatSchema,
  type EventDetail,
} from '@event-sharing/contracts';
import type { RequestHandler, Response } from 'express';
import { z } from 'zod';
import type { EventAction } from '../domain/EventLifecyclePolicy.js';
import { UnauthorizedError } from '../domain/errors/UnauthorizedError.js';
import { EventReasonSchema } from '../schemas/event-reason.schema.js';
import {
  ListEventsQuerySchema,
  ListOwnedEventsQuerySchema,
} from '../schemas/list-events.schema.js';
import type { EventService } from '../services/EventService.js';

export class EventController {
  constructor(private readonly service: EventService) {}

  listCategories: RequestHandler = async (_request, response) => {
    response.status(200).json(await this.service.listCategories());
  };

  createCategory: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const { name } = CreateCategorySchema.parse(request.body);
    response
      .status(201)
      .json(await this.service.createCategory(name, user.role));
  };

  create: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const input = CreateEventSchema.parse(request.body);
    response
      .status(201)
      .json(await this.service.create(input, user.id, user.role));
  };

  get: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.eventId);
    response.status(200).json(await this.service.get(id, user.id, user.role));
  };

  listPublic: RequestHandler = async (request, response) => {
    const { cursor, categoryId, limit } = ListEventsQuerySchema.parse(
      request.query,
    );
    response
      .status(200)
      .json(await this.service.listPublic(cursor, categoryId, limit));
  };

  listPublicByOrganizer: RequestHandler = async (request, response) => {
    const organizerId = z.uuid().parse(request.params.organizerId);
    const { cursor, limit } = ListOwnedEventsQuerySchema.parse(request.query);
    response
      .status(200)
      .json(
        await this.service.listPublicByOrganizer(organizerId, cursor, limit),
      );
  };

  listMine: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const { cursor, limit } = ListOwnedEventsQuerySchema.parse(request.query);
    response
      .status(200)
      .json(await this.service.listMine(user.id, cursor, limit));
  };

  listModeration: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const { cursor, limit } = ListOwnedEventsQuerySchema.parse(request.query);
    response
      .set('cache-control', 'no-store')
      .status(200)
      .json(await this.service.listModeration(user.role, cursor, limit));
  };

  exportMine: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    response
      .set('cache-control', 'no-store')
      .json({ events: await this.service.exportMine(user.id) });
  };

  update: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.eventId);
    const patch = UpdateEventSchema.parse(request.body);
    const result = await this.service.update(id, user.id, user.role, patch);
    this.sendTransition(response, result);
  };

  updateChatSetting: RequestHandler = async (request, response) => {
    const user = this.requireUser(request.authenticatedUser);
    const id = z.uuid().parse(request.params.eventId);
    const { chatEnabled } = UpdateEventChatSchema.parse(request.body);
    response
      .status(200)
      .json(
        await this.service.updateChatSetting(
          id,
          user.id,
          user.role,
          chatEnabled,
        ),
      );
  };

  action(action: EventAction): RequestHandler {
    return async (request, response) => {
      const user = this.requireUser(request.authenticatedUser);
      const id = z.uuid().parse(request.params.eventId);
      let reason: string | null = null;
      if (action === 'reject' || action === 'cancel') {
        reason = EventReasonSchema.parse(request.body).reason;
      } else {
        z.strictObject({}).parse(request.body ?? {});
      }
      const result = await this.service.transition(
        id,
        user.id,
        user.role,
        action,
        reason,
      );
      this.sendTransition(response, result);
    };
  }

  private sendTransition(response: Response, result: EventDetail): void {
    response.status(result.pendingStatus ? 202 : 200).json(result);
  }

  private requireUser(user: Express.Request['authenticatedUser']) {
    if (!user) throw new UnauthorizedError();
    return user;
  }
}
